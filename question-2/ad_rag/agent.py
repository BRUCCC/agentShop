"""给上层 agent 调用的入口。

一个写广告前端的 agent 不需要知道 Milvus 的集合结构。
它只调用 retrieve() 拿上下文，或在需要核对某一份文件时调用 read()。
evaluate() 用来看这套检索在内置题目上的准确率、召回率和高相关命中率。
"""

from __future__ import annotations

from ad_rag.config import COARSE_K, EMBED_DIM, EMBEDDER_PATH, EVAL_K, TOP_K
from ad_rag.embedder import HashingEmbedder
from ad_rag.eval_cases import cases
from ad_rag.metrics import high_rel_hit_at_k, precision_at_k, recall_at_k, summarize, top1_accuracy
from ad_rag.milvus_store import MilvusStore
from ad_rag.ragfs import RagFS
from ad_rag.retriever import Retriever
from ad_rag.textutil import bm25_document


class AdFrontendRAG:
    """广告前端知识库。建库、检索、读文件和评测都从这里进入。"""

    def __init__(self) -> None:
        self.filesystem = RagFS()
        self.embedder = HashingEmbedder(EMBED_DIM, EMBEDDER_PATH)
        self.store = MilvusStore()
        self.retriever = Retriever(self.store, self.filesystem, self.embedder)

    def close(self) -> None:
        """关闭向量库连接。命令行每次退出都会调用，避免留下文件锁。"""

        self.store.close()

    def ingest(self) -> dict:
        """扫描 L0/L1/L2，重建向量库。

        同一目录的摘要和概览各生成一条稠密向量。
        BM25 字段保存分词结果，稀疏向量由 Milvus 在插入时生成。
        """

        directories = self.filesystem.iter_index_dirs()
        if not directories:
            raise RuntimeError("知识库里没有可索引的目录")

        corpus = []
        for knowledge_dir in directories:
            corpus.append(knowledge_dir.l0)
            corpus.append(knowledge_dir.l1)
        self.embedder.fit(corpus)

        rows = []
        for knowledge_dir in directories:
            rows.append(
                {
                    "dir_uri": knowledge_dir.uri,
                    "title": _fit(knowledge_dir.title, 250),
                    "l0_text": _fit(knowledge_dir.l0, 4000),
                    "l1_text": _fit(knowledge_dir.l1, 16000),
                    "l0_bm25": _fit(bm25_document(knowledge_dir.l0), 8000),
                    "l1_bm25": _fit(bm25_document(knowledge_dir.l1), 32000),
                    "dense_l0": self.embedder.embed(knowledge_dir.l0),
                    "dense_l1": self.embedder.embed(knowledge_dir.l1),
                }
            )
        self.store.rebuild(rows)
        self.embedder.save()
        return {
            "collection": self.store.collection,
            "count": len(rows),
            "uris": [row["dir_uri"] for row in rows],
        }

    def retrieve(
        self,
        query: str,
        top_k: int = TOP_K,
        coarse_k: int = COARSE_K,
        load_l2: bool = True,
    ) -> dict:
        """检索知识并返回上下文。集合不存在时会先自动建库。"""

        self._ensure_index()
        return self.retriever.search(query, top_k=top_k, coarse_k=coarse_k, load_l2=load_l2)

    def evaluate(self, k: int = EVAL_K, coarse_k: int = COARSE_K) -> dict:
        """跑内置题目，汇总准确率、召回率和高相关命中率。"""

        self._ensure_index()
        details = []
        for item in cases():
            result = self.retriever.search(item["query"], top_k=k, coarse_k=max(coarse_k, k), load_l2=False)
            retrieved = [hit["uri"] for hit in result["hits"]]
            relevant = {uri.rstrip("/") for uri in item["relevant"]}
            high_relevant = {uri.rstrip("/") for uri in item["high_relevant"]}
            details.append(
                {
                    "query": item["query"],
                    "retrieved": retrieved,
                    "relevant": sorted(relevant),
                    "high_relevant": sorted(high_relevant),
                    "accuracy": top1_accuracy(retrieved, relevant),
                    "precision": precision_at_k(retrieved, relevant, k),
                    "recall": recall_at_k(retrieved, relevant, k),
                    "high_rel_hit": high_rel_hit_at_k(retrieved, high_relevant, k),
                    "warnings": result["warnings"],
                }
            )
        return {"summary": summarize(details, k), "details": details}

    def abstract(self, uri: str) -> str:
        """读取某个目录的 L0 正文。"""

        return self.filesystem.abstract(uri)

    def overview(self, uri: str) -> str:
        """读取某个目录的 L1 正文。"""

        return self.filesystem.overview(uri)

    def read(self, uri: str) -> str:
        """按 URI 读取 L2 或 sidecar 原文。"""

        return self.filesystem.read(uri)

    def ls(self, uri: str) -> list[dict[str, str]]:
        """列出目录。点开头的 L0/L1 文件不会出现。"""

        return self.filesystem.ls(uri)

    def tool_schema(self) -> dict:
        """描述 retrieve 对应的工具，方便外部 agent 注册函数调用。"""

        return {
            "name": "search_ad_knowledge",
            "description": "检索广告业务前端知识，返回分层上下文。编写信息流卡片、落地页、埋点或合规界面时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "要实现的组件、交互、埋点或合规要求",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "返回的知识目录数",
                        "default": TOP_K,
                    },
                },
                "required": ["query"],
            },
        }

    def _ensure_index(self) -> None:
        """第一次检索时自动建库。之后只有显式 ingest 才会重建。"""

        if self.store.exists() and EMBEDDER_PATH.exists():
            return
        self.ingest()


def _fit(text: str, limit: int) -> str:
    """截断到 Milvus VARCHAR 能放下的长度。中文按字符计，留一点余量。"""

    if len(text) <= limit:
        return text
    return text[:limit]

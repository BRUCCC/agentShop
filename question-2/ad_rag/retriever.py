"""粗排、精排和上下文组装。

检索分两段，对应 OpenViking 的「先用摘要定位，再用概览决定，最后按需读正文」：

1. 粗排：L0 向量 + L0 BM25，RRF 融合，得到候选目录。
2. 精排：只在候选目录上做 L1 向量 + L1 BM25，加权融合。
3. 加载：按精排顺序从文件系统读取 L2，拼成给写代码 agent 的上下文。

向量库里的文本只用于匹配。返回给 agent 的 L0/L1/L2 一律回文件系统读取，
避免索引副本和源文件不一致。
"""

from __future__ import annotations

from ad_rag.config import COARSE_K, TOP_K
from ad_rag.embedder import HashingEmbedder
from ad_rag.milvus_store import MilvusStore
from ad_rag.ragfs import KnowledgeDir, RagFS
from ad_rag.textutil import bm25_document


class Retriever:
    """面向单个查询的两段式混合检索。"""

    def __init__(self, store: MilvusStore, filesystem: RagFS, embedder: HashingEmbedder) -> None:
        self.store = store
        self.filesystem = filesystem
        self.embedder = embedder

    def search(self, query: str, top_k: int = TOP_K, coarse_k: int = COARSE_K, load_l2: bool = True) -> dict:
        """执行粗排和精排，返回可序列化的结果。

        load_l2 为 False 时只给 L0/L1。调用方可以先看导航，再按 URI 读取某一份正文。
        默认打开，因为这份 demo 的正文不长，一次取回就能写组件。
        """

        query = query.strip()
        if not query:
            raise ValueError("查询不能为空")
        top_k = max(int(top_k), 1)
        coarse_k = max(int(coarse_k), top_k)

        self.embedder.load_if_needed()
        dense_vector = self.embedder.embed(query)
        sparse_text = bm25_document(query)
        if not sparse_text:
            raise ValueError("查询里没有可用于检索的词")

        coarse_hits = self.store.coarse_search(dense_vector, sparse_text, coarse_k)
        coarse = [self._stage_row(hit) for hit in coarse_hits]
        warnings: list[str] = []

        fine_hits: list[dict] = []
        if coarse_hits:
            try:
                fine_hits = self.store.fine_search(
                    dense_vector,
                    sparse_text,
                    [hit["dir_uri"] for hit in coarse_hits],
                    top_k,
                )
            except Exception as exc:  # 精排失败时仍返回粗排，避免 agent 完全拿不到上下文。
                warnings.append(f"精排失败，已退回粗排顺序: {exc}")

        if not fine_hits:
            fine_hits = coarse_hits[:top_k]
            if coarse_hits and not warnings:
                warnings.append("精排没有返回结果，已退回粗排顺序")

        coarse_scores = {hit["dir_uri"]: hit["score"] for hit in coarse_hits}
        hits = []
        for hit in fine_hits[:top_k]:
            knowledge_dir = self._safe_get(hit["dir_uri"], warnings)
            if knowledge_dir is None:
                continue
            l2_documents = self.filesystem.read_l2(knowledge_dir) if load_l2 else []
            hits.append(
                {
                    "uri": knowledge_dir.uri,
                    "title": knowledge_dir.title,
                    "coarse_score": coarse_scores.get(knowledge_dir.uri),
                    "fine_score": float(hit["score"]),
                    "l0": knowledge_dir.l0,
                    "l1": knowledge_dir.l1,
                    "l2": l2_documents,
                }
            )

        return {
            "query": query,
            "coarse": coarse,
            "hits": hits,
            "context": build_context(query, hits, load_l2),
            "warnings": warnings,
        }

    def _safe_get(self, uri: str, warnings: list[str]) -> KnowledgeDir | None:
        """索引里的 URI 在磁盘上消失时跳过，并留下说明。"""

        try:
            return self.filesystem.get(uri)
        except FileNotFoundError:
            warnings.append(f"索引中的目录已不存在: {uri}")
            return None

    def _stage_row(self, hit: dict) -> dict:
        """粗排列表只保留定位所需的字段，不在这一层加载 L2。"""

        return {
            "uri": hit["dir_uri"],
            "title": hit.get("title") or "",
            "score": float(hit["score"]),
            "l0": hit.get("l0_text") or "",
        }


def build_context(query: str, hits: list[dict], load_l2: bool) -> str:
    """把精排结果拼成一份可以直接放进写代码提示词的文本。

    顺序就是精排顺序。排名第一的目录是主要依据，后面的目录用来核对埋点和合规。
    """

    lines = [
        f"查询：{query}",
        "以下目录按精排从高到低排列。编写广告前端时，以第 1 条的 L2 为实现依据。",
        "",
    ]
    if not hits:
        lines.append("没有检索到相关知识。")
        return "\n".join(lines)

    for index, hit in enumerate(hits, start=1):
        lines.append(f"## {index}. {hit['title']}")
        lines.append(f"目录：{hit['uri']}")
        lines.append(f"L0：{hit['l0']}")
        lines.append("L1：")
        lines.append(hit["l1"])
        if load_l2:
            for document in hit["l2"]:
                lines.append(f"### L2 {document['name']}")
                lines.append(document["content"])
        else:
            lines.append("L2 未加载。需要细则时按目录 URI 继续读取正文。")
        lines.append("")
    return "\n".join(lines).strip()

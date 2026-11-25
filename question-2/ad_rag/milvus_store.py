"""Milvus 索引。

向量库只保存检索需要的字段，正文仍以文件系统为准。
每个知识目录一行，里面有两套向量：

- dense_l0 / sparse_l0：摘要，给粗排召回。
- dense_l1 / sparse_l1：概览，给精排重排。

稀疏向量不在 Python 里计算。写入已分词的文本后，
集合上的 BM25 Function 会在 Milvus 内部生成稀疏向量。
混合检索使用 Milvus 的 hybrid_search，融合使用内置的 RRFRanker 和 WeightedRanker。
"""

from __future__ import annotations

from pathlib import Path

from pymilvus import (
    AnnSearchRequest,
    DataType,
    Function,
    FunctionType,
    MilvusClient,
    RRFRanker,
    WeightedRanker,
)

from ad_rag.config import (
    COLLECTION_NAME,
    EMBED_DIM,
    FINE_BM25_WEIGHT,
    FINE_DENSE_WEIGHT,
    MILVUS_TOKEN,
    MILVUS_URI,
    RRF_K,
)


class MilvusStore:
    """封装建库、写入和两次混合检索。"""

    def __init__(
        self,
        uri: str | None = None,
        collection: str | None = None,
        dim: int | None = None,
        token: str | None = None,
    ) -> None:
        self.uri = uri or MILVUS_URI
        self.collection = collection or COLLECTION_NAME
        self.dim = dim or EMBED_DIM
        self.token = MILVUS_TOKEN if token is None else token
        # 本地 URI 的父目录必须已经存在，否则 Milvus Lite 拒绝打开。
        if "://" not in self.uri:
            Path(self.uri).parent.mkdir(parents=True, exist_ok=True)
        self.client = MilvusClient(uri=self.uri, token=self.token) if self.token else MilvusClient(uri=self.uri)
        # 进程退出后集合会变成 released。本进程内加载一次即可。
        self._loaded = False

    def close(self) -> None:
        """释放本地库的文件锁。同一个目录同时只能被一个进程打开。"""

        close = getattr(self.client, "close", None)
        if close:
            close()

    def exists(self) -> bool:
        """集合是否已经建过。检索入口用它决定要不要先 ingest。"""

        return bool(self.client.has_collection(self.collection))

    def rebuild(self, rows: list[dict]) -> None:
        """丢掉旧集合并按当前知识库重建。

        Demo 的数据量很小，整库重建比增量更新更容易保证 L0/L1 和向量一致。
        不要在 rows 里填写 sparse_l0 / sparse_l1，那两个字段由 BM25 Function 生成。
        """

        if self.client.has_collection(self.collection):
            self.client.drop_collection(self.collection)

        schema = self.client.create_schema(auto_id=True, description="广告前端知识目录")
        schema.add_field("id", DataType.INT64, is_primary=True)
        schema.add_field("dir_uri", DataType.VARCHAR, max_length=512)
        schema.add_field("title", DataType.VARCHAR, max_length=256)
        # 原文留给结果展示和排查。BM25 读的是旁边的分词字段。
        schema.add_field("l0_text", DataType.VARCHAR, max_length=4096)
        schema.add_field("l1_text", DataType.VARCHAR, max_length=16384)
        schema.add_field("l0_bm25", DataType.VARCHAR, max_length=8192, enable_analyzer=True)
        schema.add_field("l1_bm25", DataType.VARCHAR, max_length=32768, enable_analyzer=True)
        schema.add_field("dense_l0", DataType.FLOAT_VECTOR, dim=self.dim)
        schema.add_field("dense_l1", DataType.FLOAT_VECTOR, dim=self.dim)
        schema.add_field("sparse_l0", DataType.SPARSE_FLOAT_VECTOR)
        schema.add_field("sparse_l1", DataType.SPARSE_FLOAT_VECTOR)
        schema.add_function(
            Function(
                name="bm25_l0",
                function_type=FunctionType.BM25,
                input_field_names=["l0_bm25"],
                output_field_names=["sparse_l0"],
            )
        )
        schema.add_function(
            Function(
                name="bm25_l1",
                function_type=FunctionType.BM25,
                input_field_names=["l1_bm25"],
                output_field_names=["sparse_l1"],
            )
        )

        index_params = self.client.prepare_index_params()
        index_params.add_index(field_name="dense_l0", index_type="AUTOINDEX", metric_type="COSINE")
        index_params.add_index(field_name="dense_l1", index_type="AUTOINDEX", metric_type="COSINE")
        index_params.add_index(
            field_name="sparse_l0",
            index_type="SPARSE_INVERTED_INDEX",
            metric_type="BM25",
        )
        index_params.add_index(
            field_name="sparse_l1",
            index_type="SPARSE_INVERTED_INDEX",
            metric_type="BM25",
        )
        self.client.create_collection(
            collection_name=self.collection,
            schema=schema,
            index_params=index_params,
        )
        if rows:
            self.client.insert(collection_name=self.collection, data=rows)
        self.load()

    def load(self) -> None:
        """把集合载入后才能检索。新建集合和重新打开本地库都走这里。"""

        self.client.load_collection(self.collection)
        self._loaded = True

    def coarse_search(self, dense_vector: list[float], bm25_text: str, limit: int) -> list[dict]:
        """L0 混合召回，并用 RRF 把向量名次和关键词名次合成一个粗排分。

        摘要很短，这一步的目标是尽量把相关目录放进候选，而不是定最终顺序。
        RRF 不要求两路分数处于同一量纲。
        """

        self._ensure_loaded()
        requests = [
            AnnSearchRequest(
                data=[dense_vector],
                anns_field="dense_l0",
                param={"metric_type": "COSINE"},
                limit=limit,
            ),
            AnnSearchRequest(
                data=[bm25_text],
                anns_field="sparse_l0",
                param={"metric_type": "BM25"},
                limit=limit,
            ),
        ]
        result = self.client.hybrid_search(
            collection_name=self.collection,
            reqs=requests,
            ranker=RRFRanker(RRF_K),
            limit=limit,
            output_fields=["dir_uri", "title", "l0_text"],
        )
        return unwrap_hits(result)

    def fine_search(
        self,
        dense_vector: list[float],
        bm25_text: str,
        dir_uris: list[str],
        limit: int,
    ) -> list[dict]:
        """只在粗排候选里做 L1 混合检索，再用加权排序得到精排。

        过滤条件写在每一路 AnnSearchRequest 上。
        候选集合已经很小，每一路的 limit 用候选数，最终再截断到 top_k。
        """

        if not dir_uris:
            return []
        self._ensure_loaded()
        expression = in_expr("dir_uri", dir_uris)
        candidate_limit = max(len(dir_uris), limit)
        requests = [
            AnnSearchRequest(
                data=[dense_vector],
                anns_field="dense_l1",
                param={"metric_type": "COSINE"},
                limit=candidate_limit,
                filter=expression,
            ),
            AnnSearchRequest(
                data=[bm25_text],
                anns_field="sparse_l1",
                param={"metric_type": "BM25"},
                limit=candidate_limit,
                filter=expression,
            ),
        ]
        result = self.client.hybrid_search(
            collection_name=self.collection,
            reqs=requests,
            ranker=WeightedRanker(FINE_DENSE_WEIGHT, FINE_BM25_WEIGHT),
            limit=limit,
            output_fields=["dir_uri", "title", "l0_text", "l1_text"],
        )
        return unwrap_hits(result)


    def _ensure_loaded(self) -> None:
        """同一进程里避免每次查询都重复 load。"""

        if not self._loaded:
            self.load()


def in_expr(field: str, values: list[str]) -> str:
    """拼 Milvus 的标量过滤表达式，把精排限制在粗排给出的目录里。"""

    quoted = []
    for value in values:
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        quoted.append(f'"{escaped}"')
    return f"{field} in [{', '.join(quoted)}]"


def unwrap_hits(result) -> list[dict]:
    """把 hybrid_search 的单查询结果收成普通字典。

    返回对象可以按下标取第 0 条查询。命中的正文在 entity 里，
    distance 在这个 SDK 里表示融合后的相关性，数值越大越相关。
    粗排 RRF 和精排加权分不在同一个量纲，不能跨阶段直接比较。
    """

    rows = result[0] if result else []
    hits = []
    for row in rows:
        entity = row.get("entity") or {}
        hits.append(
            {
                "id": row.get("id"),
                "score": float(row.get("distance") or 0.0),
                "dir_uri": entity.get("dir_uri", ""),
                "title": entity.get("title", ""),
                "l0_text": entity.get("l0_text", ""),
                "l1_text": entity.get("l1_text", ""),
            }
        )
    return hits

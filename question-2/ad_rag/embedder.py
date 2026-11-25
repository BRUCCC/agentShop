"""离线稠密向量。

Demo 不下载外部嵌入模型，用字符片段的哈希技巧把文本投到固定维度。
建库时统计每个特征的 IDF：所有目录都有的说法权重变低，
「留资」「唤端」这类只出现在少数目录里的说法权重变高。

这个向量只负责语义近似。精确术语交给 Milvus 内置 BM25。
换成 sentence-transformers 时，保持 embed() 的输入输出形状并重新 ingest 即可。
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from ad_rag.textutil import semantic_features


class HashingEmbedder:
    """把一段中文投成已归一化的稠密向量，供 Milvus 做余弦检索。"""

    def __init__(self, dim: int, path: Path) -> None:
        self.dim = dim
        self.path = path
        self.doc_count = 0
        self.idf: dict[str, float] = {}
        self.fitted = False

    def fit(self, texts: list[str]) -> None:
        """用本次要入库的 L0、L1 正文估计 IDF。

        每篇文档只计一次特征，避免长文把常见片段的文档频率撑高。
        """

        document_frequency: dict[str, int] = {}
        for text in texts:
            for feature in set(semantic_features(text)):
                document_frequency[feature] = document_frequency.get(feature, 0) + 1

        total = max(len(texts), 1)
        self.doc_count = total
        self.idf = {
            feature: math.log((total + 1) / (count + 1)) + 1.0
            for feature, count in document_frequency.items()
        }
        self.fitted = True

    def save(self) -> None:
        """把 IDF 写到磁盘。下一个进程检索时要读回同一份统计量。"""

        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "dim": self.dim,
            "doc_count": self.doc_count,
            "idf": self.idf,
        }
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def load(self) -> None:
        """读回建库时的 IDF。维度不一致说明换过模型，必须重新 ingest。"""

        payload = json.loads(self.path.read_text(encoding="utf-8"))
        if int(payload["dim"]) != self.dim:
            raise ValueError("嵌入维度和当前配置不一致，请重新执行 ingest")
        self.doc_count = int(payload["doc_count"])
        self.idf = {str(key): float(value) for key, value in payload["idf"].items()}
        self.fitted = True

    def load_if_needed(self) -> None:
        """检索前调用。内存里已经 fit 过就不再读盘。"""

        if self.fitted:
            return
        if not self.path.exists():
            raise RuntimeError("还没有向量统计量，请先执行 ingest")
        self.load()

    def embed(self, text: str) -> list[float]:
        """生成一条 L2 归一化向量。Milvus 的 COSINE 索引按方向比较这些向量。"""

        if not self.fitted:
            raise RuntimeError("嵌入器还没有 fit 或 load")

        vector = [0.0] * self.dim
        default_weight = self._default_idf()
        for feature in semantic_features(text):
            index, sign = self._bucket(feature)
            vector[index] += sign * self.idf.get(feature, default_weight)

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0.0:
            vector[0] = 1.0
            return vector
        return [value / norm for value in vector]

    def _default_idf(self) -> float:
        """查询里出现、语料里没见过的特征，用平均 IDF，避免生僻错字主导整条向量。"""

        if not self.idf:
            return 1.0
        return sum(self.idf.values()) / len(self.idf)

    def _bucket(self, feature: str) -> tuple[int, float]:
        """哈希技巧：特征名映射到一个维度，并带上正负号，减轻碰撞时的叠加。"""

        digest = hashlib.md5(feature.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "little") % self.dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        return index, sign

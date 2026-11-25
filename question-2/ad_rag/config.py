"""运行参数。

路径、集合名和两段检索的条数集中在这里，避免散落在建库和检索流程中。
环境变量 MILVUS_URI 可以改成远程 Milvus，例如 http://localhost:19530。
本地默认使用 Milvus Lite 的目录库，不需要单独起服务。
"""

from __future__ import annotations

import os
from pathlib import Path

# 仓库根目录。知识库和本地向量库都相对这里放置。
PROJECT_ROOT = Path(__file__).resolve().parents[1]

# RAGFS 根目录。磁盘上的 resources/... 对应 viking://resources/...
KNOWLEDGE_ROOT = PROJECT_ROOT / "knowledge"

# Milvus Lite 3 会把以 .db 结尾的路径建成目录，而不是单个文件。
DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_MILVUS_URI = str((DATA_DIR / "milvus.db").resolve())
MILVUS_URI = os.environ.get("MILVUS_URI", DEFAULT_MILVUS_URI)
MILVUS_TOKEN = os.environ.get("MILVUS_TOKEN") or None

# 一行对应一个含 L2 正文的知识目录，而不是每一个源文件。
COLLECTION_NAME = "ad_frontend_knowledge"

# 哈希向量维度。更换嵌入模型时要同时改维度并重新 ingest。
EMBED_DIM = 384

# 查询必须使用和建库相同的 IDF，否则同一句话会落到不同向量。
EMBEDDER_PATH = DATA_DIR / "embedder.json"

# 粗排召回的目录数。需要大于最终条数，精排才有重排空间。
COARSE_K = 8

# 交给上层 agent 的目录数。L2 按这个条数整目录加载。
TOP_K = 3

# 精排融合权重。顺序必须和请求顺序一致：先 L1 向量，再 L1 的 BM25。
FINE_DENSE_WEIGHT = 0.55
FINE_BM25_WEIGHT = 0.45

# RRF 平滑常数，沿用 Milvus 默认。第 r 名的贡献是 1 / (k + r)。
RRF_K = 60

# 评测截断位置，和 agent 实际拿到的条数对齐。
EVAL_K = 3

# OpenViking 用 viking:// 给目录树编址，这里沿用同一写法。
URI_SCHEME = "viking://"

"""广告前端 RAG。

参照 OpenViking 的上下文分层：L0 摘要做粗召回，L1 概览做精排，L2 正文按需加载。
上层写代码的 agent 从 AdFrontendRAG.retrieve 取得上下文。
"""

from ad_rag.agent import AdFrontendRAG

__all__ = ["AdFrontendRAG"]

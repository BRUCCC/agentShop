# 广告前端 RAG

这是一个给「编写广告业务前端」用的小型检索 demo，目录分层参照 [OpenViking](https://github.com/volcengine/OpenViking) 的 L0 / L1 / L2。

知识按目录存放，不把每篇正文都切成碎片：

| 层 | 文件 | 用途 |
| --- | --- | --- |
| L0 | `.abstract.md` | 短摘要，向量加 BM25 做粗排召回 |
| L1 | `.overview.md` | 概览和导航，只在候选目录里做精排 |
| L2 | 其他 Markdown | 规则和示例代码，精排之后按需读取 |

向量库使用 Milvus。混合检索调用 `hybrid_search`：稠密向量走余弦，关键词走集合内置的 BM25 Function。粗排用 `RRFRanker` 融合 L0 的两路结果，精排用 `WeightedRanker` 融合 L1 的两路结果，并把范围限制在粗排候选里。

本地默认使用 Milvus Lite，数据写在 `data/milvus.db`。同一个目录同时只能有一个进程打开。

## 运行

```bash
pip install -r requirements.txt
python -m ad_rag ingest
python -m ad_rag search "开屏全屏广告的跳过按钮放哪"
python -m ad_rag ask "写一个带广告标识的信息流卡片，并做曝光"
python -m ad_rag eval
```

`search` 会同时打印粗排和精排。`ask` 输出可以直接放进写代码提示词的上下文。`eval` 在内置 12 道题上统计三份结果：准确率是精排第 1 名命中相关目录的查询比例，召回率是 Recall@K，高相关命中率是前 K 条里出现高相关目录的查询比例。输出里同时给出 Precision@K。

也可以先看导航再读正文：

```bash
python -m ad_rag ls viking://resources/ad-frontend
python -m ad_rag read viking://resources/ad-frontend --layer l1
python -m ad_rag read viking://resources/ad-frontend/feed-card/card.md
```

## 给 agent 调用

```python
from ad_rag import AdFrontendRAG

rag = AdFrontendRAG()
try:
    result = rag.retrieve("写一个留资表单，没勾选隐私协议不能提交")
    print(result["context"])
    metrics = rag.evaluate()
    print(metrics["summary"])
finally:
    rag.close()
```

`retrieve` 的返回里有三段：`coarse` 是粗排候选，`hits` 是精排后的目录及 L0/L1/L2，`context` 是拼好的文本。`tool_schema()` 给出函数调用描述。外部程序若只要 JSON，可以执行 `python -m ad_rag ask --json "查询"`。

修改 `knowledge/` 之后需要重新 `python -m ad_rag ingest`，检索才会用到新内容。

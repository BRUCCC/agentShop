"""检索评测指标。

这些数字都在精排结果上计算，K 是 agent 实际拿到的目录数。

- 准确率：精排第 1 名落在相关目录里的查询比例。写代码时主要看第一条。
- 召回率 Recall@K：该题全部相关目录里，有多少进入了前 K 条。
- 高相关命中率：前 K 条是否至少包含一条高相关目录。单题为 0 或 1，多题取平均。
- Precision@K：前 K 条里相关目录所占的比例，分母固定为 K。相关目录通常少于 K，这项会低于准确率。

高相关是相关集合的子集。相邻但不是首选的目录只算相关。
"""

from __future__ import annotations


def top1_accuracy(retrieved: list[str], relevant: set[str]) -> float:
    """准确率的单题结果。精排第 1 名属于相关目录时为 1。"""

    if not retrieved:
        return 0.0
    return 1.0 if retrieved[0].rstrip("/") in relevant else 0.0


def precision_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    """Precision@K。没有返回满 K 条时，空缺位置视为不相关。"""

    if k <= 0:
        return 0.0
    top = _top(retrieved, k)
    hit = sum(1 for uri in top if uri in relevant)
    return hit / k


def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    """召回率。该题没有标注相关目录时记 0，避免除零。"""

    if not relevant or k <= 0:
        return 0.0
    top = set(_top(retrieved, k))
    return len(top & relevant) / len(relevant)


def high_rel_hit_at_k(retrieved: list[str], high_relevant: set[str], k: int) -> float:
    """高相关命中率的单题结果。命中任意一条高相关目录即为 1。"""

    if not high_relevant or k <= 0:
        return 0.0
    top = set(_top(retrieved, k))
    return 1.0 if top & high_relevant else 0.0


def summarize(rows: list[dict], k: int) -> dict:
    """对每题指标做宏平均。每道查询的权重相同，不受相关文档条数影响。"""

    if not rows:
        return {
            "queries": 0,
            "k": k,
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "high_rel_hit": 0.0,
        }
    total = len(rows)
    return {
        "queries": total,
        "k": k,
        "accuracy": sum(row["accuracy"] for row in rows) / total,
        "precision": sum(row["precision"] for row in rows) / total,
        "recall": sum(row["recall"] for row in rows) / total,
        "high_rel_hit": sum(row["high_rel_hit"] for row in rows) / total,
    }


def _top(retrieved: list[str], k: int) -> list[str]:
    """截断到前 K 条，并去掉重复 URI。重复目录不应被算成多次命中。"""

    chosen: list[str] = []
    for uri in retrieved:
        normalized = uri.rstrip("/")
        if normalized in chosen:
            continue
        chosen.append(normalized)
        if len(chosen) >= k:
            break
    return chosen

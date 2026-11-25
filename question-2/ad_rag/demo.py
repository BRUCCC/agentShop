"""命令行入口。

python -m ad_rag ingest
python -m ad_rag search "开屏广告的跳过按钮放哪"
python -m ad_rag ask "写一个带广告标识的信息流卡片"
python -m ad_rag eval
"""

from __future__ import annotations

import argparse
import json
import sys

from ad_rag.agent import AdFrontendRAG
from ad_rag.config import COARSE_K, EVAL_K, TOP_K


def main(argv: list[str] | None = None) -> None:
    """解析子命令并保证向量库在退出时关闭。"""

    _configure_stdio()
    parser = argparse.ArgumentParser(description="广告前端 RAG demo")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("ingest", help="扫描知识库并重建 Milvus 索引")

    search_parser = subparsers.add_parser("search", help="执行粗排和精排，打印命中目录")
    _add_query_arguments(search_parser)

    ask_parser = subparsers.add_parser("ask", help="检索并输出给写代码 agent 的上下文")
    _add_query_arguments(ask_parser)
    ask_parser.add_argument("--json", action="store_true", help="以 JSON 输出，便于外部 agent 解析")

    eval_parser = subparsers.add_parser("eval", help="统计准确率、召回率和高相关命中率")
    eval_parser.add_argument("--k", type=int, default=EVAL_K, help="评测截断条数")
    eval_parser.add_argument("--json", action="store_true", help="以 JSON 输出")

    ls_parser = subparsers.add_parser("ls", help="列出知识目录，隐藏 L0/L1 旁路文件")
    ls_parser.add_argument("uri", nargs="?", default="viking://resources/ad-frontend")

    read_parser = subparsers.add_parser("read", help="按 viking URI 读取文件或查看 L0/L1")
    read_parser.add_argument("uri")
    read_parser.add_argument(
        "--layer",
        choices=("raw", "l0", "l1"),
        default="raw",
        help="raw 读文件原文，l0/l1 读目录摘要或概览",
    )

    args = parser.parse_args(argv)
    rag = AdFrontendRAG()
    try:
        _dispatch(rag, args)
    finally:
        rag.close()


def _add_query_arguments(parser: argparse.ArgumentParser) -> None:
    """给检索类子命令挂上查询词和两段条数。"""

    parser.add_argument("query", help="自然语言查询")
    parser.add_argument("--top-k", type=int, default=TOP_K, help="精排后返回的目录数")
    parser.add_argument("--coarse-k", type=int, default=COARSE_K, help="粗排召回的目录数")


def _dispatch(rag: AdFrontendRAG, args: argparse.Namespace) -> None:
    """按子命令调用建库、检索、评测或文件读取。"""

    if args.command == "ingest":
        report = rag.ingest()
        print(f"已索引 {report['count']} 个知识目录到集合 {report['collection']}")
        for uri in report["uris"]:
            print(f"  {uri}")
        return

    if args.command == "search":
        result = rag.retrieve(args.query, top_k=args.top_k, coarse_k=args.coarse_k, load_l2=False)
        print(_format_search(result))
        return

    if args.command == "ask":
        result = rag.retrieve(args.query, top_k=args.top_k, coarse_k=args.coarse_k, load_l2=True)
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print(result["context"])
        return

    if args.command == "eval":
        report = rag.evaluate(k=args.k)
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print(_format_eval(report))
        return

    if args.command == "ls":
        for entry in rag.ls(args.uri):
            print(f"{entry['kind']:4}  {entry['name']}")
        return

    if args.command == "read":
        if args.layer == "l0":
            print(rag.abstract(args.uri))
        elif args.layer == "l1":
            print(rag.overview(args.uri))
        else:
            print(rag.read(args.uri))
        return

    raise ValueError(f"未知命令: {args.command}")


def _format_search(result: dict) -> str:
    """同时打印粗排候选和精排结果，方便观察两段排序是否不同。"""

    lines = [f"查询：{result['query']}", "", "粗排（L0 向量 + BM25，RRF）"]
    if not result["coarse"]:
        lines.append("  无候选")
    for index, hit in enumerate(result["coarse"], start=1):
        lines.append(f"  {index}. {hit['score']:.4f}  {hit['uri']}")
        lines.append(f"     {hit['l0']}")

    lines.append("")
    lines.append("精排（L1 向量 + BM25，加权融合）")
    if not result["hits"]:
        lines.append("  无结果")
    for index, hit in enumerate(result["hits"], start=1):
        lines.append(f"  {index}. {hit['fine_score']:.4f}  {hit['title']}")
        lines.append(f"     {hit['uri']}")
        lines.append(f"     {hit['l0']}")
    for warning in result["warnings"]:
        lines.append(f"注意：{warning}")
    return "\n".join(lines)


def _format_eval(report: dict) -> str:
    """把三份宏平均和逐题命中情况打成可读文本。"""

    summary = report["summary"]
    k = summary["k"]
    lines = [
        f"评测查询 {summary['queries']} 条，K={k}",
        f"准确率: {summary['accuracy']:.3f}",
        f"召回率 Recall@{k}: {summary['recall']:.3f}",
        f"高相关命中率: {summary['high_rel_hit']:.3f}",
        f"Precision@{k}: {summary['precision']:.3f}",
        "",
    ]
    for row in report["details"]:
        mark = "命中" if row["high_rel_hit"] else "未命中"
        ranked = " > ".join(_leaf(uri) for uri in row["retrieved"]) or "无"
        expected = ",".join(_leaf(uri) for uri in row["high_relevant"])
        lines.append(f"[{mark}] {row['query']}")
        lines.append(f"  精排: {ranked}")
        lines.append(
            f"  高相关: {expected}  准确率={row['accuracy']:.0f}  召回率={row['recall']:.2f}"
        )
    return "\n".join(lines)


def _leaf(uri: str) -> str:
    """评测输出里只保留目录最后一级，避免每行都重复协议前缀。"""

    return uri.rstrip("/").split("/")[-1]


def _configure_stdio() -> None:
    """让 Windows 控制台按 UTF-8 输出中文结果。"""

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            continue


if __name__ == "__main__":
    main()

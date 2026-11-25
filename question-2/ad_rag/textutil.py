"""分词和 OKF 正文提取。

OpenViking 的 L0/L1 是带 YAML frontmatter 的目录旁路文件。
检索和向量化只使用正文，来源、生成器、新鲜度不参与匹配。

Milvus 的 BM25 使用字段上的分析器。中文句子没有空格，默认分析器几乎无法按词命中。
这里先用 jieba 切开，再用空格拼回，标准分析器就能按广告术语做关键词检索。
"""

from __future__ import annotations

import logging
import re

import jieba

# 首次切词会加载词典。压掉 jieba 自己的启动日志，避免干扰评测输出。
jieba.setLogLevel(logging.ERROR)

# 广告前端里经常连在一起的说法。加进词典后，查询和文档会切成同一个词。
_DOMAIN_WORDS = (
    "信息流",
    "原生广告",
    "广告标识",
    "广告卡片",
    "立即下载",
    "开屏",
    "倒计时",
    "跳过按钮",
    "优惠券",
    "满减",
    "已领取",
    "落地页",
    "利益点",
    "留资",
    "手机号",
    "隐私协议",
    "隐私政策",
    "监测链接",
    "宏参数",
    "时间戳",
    "点击id",
    "动态创意",
    "模板变量",
    "兜底文案",
    "实验号",
    "分组号",
    "假关闭",
    "关闭按钮",
    "唤端",
    "深链",
    "未安装",
    "1280x720",
    "15秒",
    "曝光埋点",
)

for _word in _DOMAIN_WORDS:
    jieba.add_word(_word)

# 单字虚词对区分目录没有帮助，留在句子里只会让每篇文档都变得更像。
_STOPWORDS = {
    "的",
    "了",
    "和",
    "与",
    "或",
    "在",
    "是",
    "要",
    "才",
    "并",
    "及",
    "对",
    "把",
    "被",
    "从",
    "用",
    "将",
    "就",
    "都",
    "也",
    "还",
    "不",
    "没",
    "一个",
    "进行",
    "以及",
    "需要",
    "可以",
    "我们",
    "如果",
    "如何",
    "怎么",
    "什么",
}

_CJK_RUN = re.compile(r"[\u4e00-\u9fff]+")


def split_frontmatter(text: str) -> tuple[str, str]:
    """拆开 OKF 文件，返回 (frontmatter, body)。

    abstract() 和 overview() 只把 body 交给调用方。
    没有 frontmatter 的旧 Markdown 整篇都视为正文。
    """

    normalized = text.lstrip("\ufeff")
    if not normalized.startswith("---"):
        return "", normalized.strip()

    lines = normalized.splitlines()
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            front = "\n".join(lines[: index + 1])
            body = "\n".join(lines[index + 1 :]).strip()
            return front, body
    return "", normalized.strip()


def first_heading(body: str, fallback: str) -> str:
    """取正文里的第一个一级标题，作为目录在检索结果中的名字。"""

    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


def content_tokens(text: str) -> list[str]:
    """把一段文字切成用于 BM25 的词序列。

    保留重复词，词频才会进入 Milvus 的 BM25。
    标点和单字虚词丢掉，避免「的」「，」成为关键词。
    """

    tokens: list[str] = []
    for raw in jieba.lcut(text):
        word = raw.strip().lower()
        if not word or word in _STOPWORDS:
            continue
        if re.fullmatch(r"[\W_]+", word, flags=re.UNICODE):
            continue
        # 单个汉字区分度太低；英文和数字保留两位及以上的术语，例如 id、15。
        if len(word) < 2 and not word.isascii():
            continue
        tokens.append(word)
    return tokens


def bm25_document(text: str) -> str:
    """拼出写入 Milvus 文本字段的分词串。

    BM25 Function 读的是这个字段，不是给用户看的原文。
    """

    return " ".join(content_tokens(text))


def semantic_features(text: str) -> list[str]:
    """构造稠密向量用的特征。

    在分词结果之外补上连续汉字的二字、三字片段。
    查询和文档的切词边界不一致时，重叠片段仍然能把它们拉近。
    """

    features = content_tokens(text)
    for segment in _CJK_RUN.findall(text):
        for size in (2, 3):
            if len(segment) < size:
                continue
            for start in range(len(segment) - size + 1):
                features.append(segment[start : start + size])
    return features

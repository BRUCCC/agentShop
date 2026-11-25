"""广告前端检索的标注题。

每题给出相关目录和高相关目录。高相关目录是写这道题时应该优先打开的那一份。
相关目录包含高相关目录，也可以带上确实会用到的相邻知识。
评测只看目录 URI，不要求命中某一个 L2 文件，因为索引粒度是目录。
"""

from __future__ import annotations

BASE = "viking://resources/ad-frontend"


def _uri(name: str) -> str:
    return f"{BASE}/{name}"


def cases() -> list[dict]:
    """返回内置评测集。改知识库的目录名时要同步改这里。"""

    return [
        _case(
            "信息流里插一条原生广告卡片，左上角广告标识和立即下载按钮怎么放",
            high=["feed-card"],
        ),
        _case(
            "卡片在屏幕里露出一半并停留一秒，才上报一次曝光",
            high=["feed-card"],
        ),
        _case(
            "开屏全屏广告右上角倒计时，用户可以点跳过按钮",
            high=["banner"],
        ),
        _case(
            "优惠券面额和满减门槛，领取后按钮变成已领取，倒计时结束置灰",
            high=["coupon"],
        ),
        _case(
            "落地页首屏就要看到利益点，底部按钮滚动时一直固定",
            high=["landing"],
        ),
        _case(
            "留资要校验手机号，没勾选隐私协议不能提交",
            high=["lead-form"],
            related=["compliance"],
        ),
        _case(
            "点击监测链接需要替换点击id和时间戳宏参数",
            high=["tracking"],
        ),
        _case(
            "信息流图片用1280x720，视频素材控制在15秒",
            high=["creative"],
        ),
        _case(
            "同一个广告位按实验分组展示不同卡片样式，埋点带上实验号",
            high=["experiment"],
        ),
        _case(
            "广告必须出现广告两个字，关闭按钮要能点到，不能做假关闭",
            high=["compliance"],
        ),
        _case(
            "唤起 App 失败或者用户未安装时，要退回 H5 落地页",
            high=["deeplink"],
            related=["landing"],
        ),
        _case(
            "动态创意里的标题、价格、图片用模板变量替换，缺了就用兜底文案",
            high=["creative"],
        ),
    ]


def _case(query: str, high: list[str], related: list[str] | None = None) -> dict:
    """组装一题。高相关目录会自动并进相关集合。"""

    high_uris = [_uri(name) for name in high]
    related_uris = [_uri(name) for name in (related or [])]
    relevant: list[str] = []
    for uri in high_uris + related_uris:
        if uri not in relevant:
            relevant.append(uri)
    return {
        "query": query,
        "relevant": relevant,
        "high_relevant": high_uris,
    }

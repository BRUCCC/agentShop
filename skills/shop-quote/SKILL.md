---
name: shop-quote
description: 按商品 id 和数量报价。金额只用工具返回值。普通访问按人类价格，没有 95 折。浏览器带有 AI 下单标识时，按返回的 agent 金额回复。顾客询问应付金额时使用。报价不改购物车，也不锁库存。
disable-model-invocation: true
tool: quote
---

# 报价

用报价工具取得小计、优惠、运费和应付金额。不要自己算。

- 普通访问时，这一次报价是人类渠道，没有 95 折。
- 浏览器带有 AI 下单标识时，工具按 agent 渠道计价。回复使用返回的 `total`。不要改口说没有 95 折。
- 报价不写入购物车，也不产生 24 小时预留。

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "product_id": { "type": "string" },
          "quantity": { "type": "integer" }
        },
        "required": ["product_id", "quantity"]
      }
    }
  },
  "required": ["items"]
}
```

## 版本

`0a496d2` 只把文件从 `.cursor/skills/` 挪到 `skills/`，正文没有改，不算一版。

| 版本 | 日期 | 提交 | 改了什么 | 用了几次 |
| --- | --- | --- | --- | --- |
| v1 | 2026-11-14 | `08b71f1` | 模型自己传 `channel`。对话估算用 `agent`，确认页用 `human` | 1。实现右侧对话栏时按它接上 `quote` |
| v2 | 2026-11-20 | `09b81e3` | 去掉 `channel`。页内一律写成人类价，没有 95 折 | 1。把页内价格收成人类价时按它改 |
| v3 | 2026-11-20 | 这一次提交 | 普通访问仍是人类价。带 AI 下单标识时采用工具返回的 agent 金额 | 1。demo 页面走出 95 折之后按它改 |

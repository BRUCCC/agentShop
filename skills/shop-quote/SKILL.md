---
name: shop-quote
description: 按商品 id、数量和渠道报价。顾客询问应付金额时使用。报价不改购物车，也不锁库存。
disable-model-invocation: true
tool: quote
---

# 报价

用报价工具取得小计、优惠、运费和应付金额。不要自己算。

- 对话栏里替顾客估算下单金额时，`channel` 用 `agent`。
- 顾客要看自己在确认页付款的金额时，`channel` 用 `human`。
- 报价不写入购物车，也不产生 24 小时预留。

```json
{
  "type": "object",
  "properties": {
    "channel": { "type": "string", "enum": ["human", "agent"] },
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

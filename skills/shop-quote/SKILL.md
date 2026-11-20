---
name: shop-quote
description: 按商品 id 和数量做页内报价，按人类价格计算，没有 95 折。顾客询问应付金额时使用。报价不改购物车，也不锁库存。
disable-model-invocation: true
tool: quote
---

# 报价

用报价工具取得小计、优惠、运费和应付金额。不要自己算。页内对话一律按人类渠道报价，没有 95 折。

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

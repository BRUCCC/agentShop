---
name: shop-search
description: 按名称、品牌、分类和是否有货搜索本商店商品。顾客要找商品、比较若干候选时使用。默认 8 笔，最多 20 笔。
disable-model-invocation: true
tool: search_products
---

# 搜索商品

调用搜索工具。不要一次索取全部商品。

- `limit` 不填时按 8 笔。
- 服务端把 `limit` 限制在 1 到 20。
- 只根据工具返回的 id、名称、标价和库存回答。
- P001 和 P002 同名，搜索结果必须保留 id，不能合并成一件。

```json
{
  "type": "object",
  "properties": {
    "q": { "type": "string" },
    "brand": { "type": "string" },
    "category": { "type": "string" },
    "in_stock": { "type": "boolean" },
    "limit": { "type": "integer" }
  }
}
```

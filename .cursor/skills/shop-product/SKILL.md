---
name: shop-product
description: 按商品 id 查看规格、库存和全部评论。顾客要比较规格、确认库存或阅读评论时使用。
disable-model-invocation: true
tool: get_product
---

# 查看商品

只按商品 id 查看。不能用名称代替 id，也不能把同名的 P001 和 P002 互相替换。

规格、库存和评论只转述工具返回的内容。

```json
{
  "type": "object",
  "properties": {
    "product_id": { "type": "string" }
  },
  "required": ["product_id"]
}
```

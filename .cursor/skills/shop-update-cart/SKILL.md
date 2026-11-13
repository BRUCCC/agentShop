---
name: shop-update-cart
description: 修改和网页共用的那一辆购物车。顾客要求加入、删除或改数量时使用。只说加入购物车时只改购物车，不下单。
disable-model-invocation: true
tool: update_cart
---

# 更新购物车

agent 操作的购物车和网页是同一辆。人能直接编辑 agent 操作后的购物车，也能通过 agent 修改用户自己添加的商品。

- 只使用商品 id。数量大于 0 是设置成这个数量，0 是从这辆车删除。
- 这个工具不能下单，也不能写 24 小时预留。
- 改完后，网页上的购物车和页头数量会看到同一份内容。

```json
{
  "type": "object",
  "properties": {
    "product_id": { "type": "string" },
    "quantity": { "type": "integer" }
  },
  "required": ["product_id", "quantity"]
}
```

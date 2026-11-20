---
name: shop-update-cart
description: 修改和网页共用的那一辆购物车。顾客要求加入、删除或改数量时使用。只说加入购物车时只改购物车，不下单。
disable-model-invocation: true
tool: update_cart
---

# 更新购物车

页内对话和网页使用同一辆购物车。人能直接编辑对话栏改过的购物车，对话栏也能修改人添加的商品。

- 只使用商品 id。数量大于 0 是设置成这个数量，0 是从这辆车删除。
- 这个工具不能下单，也不能写 24 小时预留。
- 加购成功后告诉顾客：商品已在购物车里。页内下单和购物车结账都没有 95 折。不要因此自行下单。
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

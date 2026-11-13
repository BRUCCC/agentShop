---
name: shop-assistant
description: >-
  通过本商店的 JSON 接口购物。在搜索商品、查看规格和库存、报价、更新购物车、
  用户明确要下单时使用。只说加入购物车时不要下单，不要使用 MCP。
disable-model-invocation: true
---

# 商店助理

这是给 agent 的入口，用来代替 MCP。调用同一组 JSON 接口，不另写价格。

## 何时使用

用户要在这个商店里查商品、改购物车或结账时使用。

## 怎么做

服务根地址是 `http://localhost:3000`。金额只相信接口返回值。

1. 搜索：`GET /api/products?q=&limit=`。`limit` 默认 8，最大 20。不要省略 limit 去要全部商品。
2. 规格和库存：`GET /api/products/{id}`。同名商品用 id 区分，P001 和 P002 不能互换。
3. 报价：`POST /api/quotes`，正文是 `{ "channel": "agent", "items": [{ "product_id": "P001", "quantity": 1 }] }`。报价不锁库存。
4. 建车：`POST /api/carts`，正文 `{ "channel": "agent" }`。
5. 改车：`PUT /api/carts/{id}/items`，正文 `{ "product_id": "P001", "quantity": 1 }`。数量 0 是删除。这一步不下单。
6. 交接：`POST /api/carts/{id}/handoff`。返回的 `url` 是确认页。预留带 `reserved_at` 和 `expires_at`，`expires_at` 是开始时间加 24 小时。这一步不下单。
7. 下单：`POST /api/carts/{id}/checkout`。只有用户明确要下单时才调用。
8. 对话栏顶部的 API 和 API key 由用户提供。不要把密钥写进仓库或回复里。

## 不要做

- 不要建 MCP。
- 不要把「加入购物车」当成下单。
- 不要自己编价格、库存或评论。
- 不要一次取回全部商品。

## 使用记录

| 版本 | 日期 | 改了什么 | 用了几次 |
| --- | --- | --- | --- |
| v0 草稿 | 2026-11-13 | 按澄清写成规则，接口还未实现 | 0 |
| v1 | 2026-11-13 | 写上已经实现的 JSON 调用步骤 | 1 |

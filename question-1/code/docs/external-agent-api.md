# 外部 agent API

基地址是服务根地址，本地为 `http://localhost:3000`。请求和响应都是 JSON。不使用浏览器 cookie。调用方自己保存 `cart_id`。

这一组接口给 ChatGPT 这类外部 agent 使用。通过这里创建的购物车和订单来源是 agent，结账享受 95 折。没有线上服务时，用下面的本地页面。普通打开网页仍是人类渠道，没有这层折扣。

不建 MCP。价格只相信接口返回值，响应不包含毛利率。P001 和 P002 同名，加购和下单只认商品 id。

商品、库存和报价都带 `queried_at`。用这一次响应里的数字，不要沿用更早一次的报价。

## 本地页面

没有部署地址时，第三方 agent 在本机打开：

`http://localhost:3000/?as=agent`

服务会写入标识 `shop_actor=agent`。之后这个浏览器里的购物车、报价、确认页和页内对话都按 AI 下单计价，满减后再享 95 折。页头下会出现「当前是 AI 下单」。

打开 `http://localhost:3000/?as=human` 会清掉标识，恢复人类价格。

agent 可以自己点击商品、加入购物车，再在确认页模拟付款。不需要调用下面的 JSON 接口。Web API 仍然是有线上服务时的入口。

## 搜索商品

`GET /api/products?q=耳机&limit=8&offset=0`

`limit` 默认 8，最大 20。可加 `brand`、`category`、`in_stock=1`。结果按推荐分从高到低，带标价、库存和 `queried_at`。不返回全部评论。

## 查看一件商品

`GET /api/products/P001`

返回规格、库存、全部评论和 `queried_at`。

## 报价

`POST /api/quotes`

```json
{ "channel": "agent", "items": [{ "product_id": "P001", "quantity": 1 }] }
```

外部 agent 要看自己的应付金额时，`channel` 传 `agent`。这会先按满额减计算，再对商品金额乘 0.95，运费不参加 95 折。不锁库存，不改购物车。响应带 `queried_at`。

## 购物车

`POST /api/carts`

```json
{ "channel": "agent" }
```

返回 `cart_id`。请求里没有本地页面标识时，这辆车不会写进浏览器 cookie。之后的加购和结账都用这个 id。

`GET /api/carts/{cart_id}`

读取这辆车。

`PUT /api/carts/{cart_id}/items`

```json
{ "product_id": "P001", "quantity": 1 }
```

数量大于 0 是设置成这个数量，0 是删除。这一步不下单。

## 直接下单

`POST /api/carts/{cart_id}/checkout`

```json
{ "product_ids": ["P001"] }
```

`product_ids` 可以不传，不传就结算这辆车里的全部商品。订单渠道跟这辆车走：agent 车按 agent 计价，有 95 折。这里不检查顾客在网页对话里有没有说出「下单」。

只做加购时，不要调用这个接口。

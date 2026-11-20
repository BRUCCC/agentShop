---
name: shop-handoff
description: 为当前这辆购物车锁库存 24 小时并给出确认页链接。顾客要保留商品、稍后在确认页付款时使用。这一步不下单。
disable-model-invocation: true
tool: create_handoff
---

# 建立交接

对当前这辆购物车建立交接。锁价按人类渠道计算，没有 95 折。

- 写入每件商品的预留，`expires_at` 是 `reserved_at` 加 24 小时。
- 返回确认页链接。链接不过期，锁只保留 24 小时。
- 不要在这一步调用下单。
- 之后如果人或对话栏又改了这辆车，旧预留会释放。

```json
{
  "type": "object",
  "properties": {}
}
```

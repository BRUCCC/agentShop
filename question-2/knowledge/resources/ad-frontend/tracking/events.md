# 广告事件

三类事件覆盖一次投放的可见、点击和转化。组件只负责在正确的时机调用，字段在这一层补齐。

| 事件 | 时机 |
| --- | --- |
| impression | 展示规则满足之后，例如卡片露出一半并停留一秒 |
| click | 用户点了素材或主按钮，且不是关闭 |
| conversion | 留资成功、领取成功或应用唤起成功 |

## 公共字段

```js
// 所有广告事件共用身份字段，具体事件再追加自己的属性。
export function buildAdEvent(name, ad, extra = {}) {
  return {
    name,
    campaignId: ad.campaignId,
    adId: ad.adId,
    creativeId: ad.creativeId,
    slotId: ad.slotId,
    requestId: ad.requestId,
    ts: Date.now(),
    ...extra,
  };
}
```

转化事件额外带 `conversionType`，取值 `lead`、`claim` 或 `open_app`。不要把手机号明文放进事件。

## 相关条目

- [卡片曝光](../feed-card/exposure.md)：impression 的时机是露出一半并停留一秒。
- [留资表单](../lead-form/form.md)：lead 转化在校验通过并提交成功之后。
- [优惠券](../coupon/coupon.md)：claim 转化在领取接口返回成功之后。
- [监测链接宏参数](macros.md)：同一次点击的 clickId 从这里继续传到监测链接。

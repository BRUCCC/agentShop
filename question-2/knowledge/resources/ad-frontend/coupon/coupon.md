# 优惠券

优惠券卡片包含三块：左侧面额、右侧满减门槛和有效期、底部领取按钮。倒计时放在门槛下面，提醒剩余时间，不要盖住面额。

## 状态

| 状态 | 按钮 | 是否可点 |
| --- | --- | --- |
| 未领取且未过期 | 立即领取 | 是 |
| 已领取 | 已领取 | 否 |
| 倒计时结束 | 已结束 | 否，并置灰 |

领取请求进行中时禁用按钮，防止连点发出多张券。返回成功再切换成已领取，不要在点击瞬间就改文案。

## 示例

```jsx
// 按券的状态决定按钮。过期优先于未领取。
export function CouponAction({ coupon, now, pending, onClaim }) {
  const expired = now >= coupon.expireAt;
  if (coupon.claimed) {
    return <button disabled>已领取</button>;
  }
  if (expired) {
    return <button disabled className="is-muted">已结束</button>;
  }
  return (
    <button disabled={pending} onClick={() => onClaim(coupon.id)}>
      {pending ? "领取中" : "立即领取"}
    </button>
  );
}
```

面额使用大号数字，满减门槛使用「满{threshold}可用」。没有门槛时写「无门槛」，不要留空白。

## 相关条目

- [落地页结构](../landing/landing.md)：领取按钮也可以做成落地页底部的固定主按钮。
- [广告事件](../tracking/events.md)：领取成功记 conversion，conversionType 用 claim。

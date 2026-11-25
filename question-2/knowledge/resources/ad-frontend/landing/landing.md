# 落地页结构

落地页按这个顺序排：主视觉、利益点、最多三条卖点、说明、底部固定按钮。首屏高度按手机视口计算，利益点和按钮的上沿都要落在第一屏里。

## 底部按钮

按钮文案来自创意，缺省为「立即领取」。滚动时一直固定在底部，背景加实色，避免透出正文后看不清。

正文容器写 `padding-bottom: calc(56px + env(safe-area-inset-bottom))`。按钮自己再加安全区，避免贴住 iPhone 的横条。

## 示例

```jsx
// 首屏放利益点，转化按钮不随内容滚走。
export function LandingPage({ page }) {
  return (
    <main className="landing">
      <img className="hero" src={page.heroUrl} alt="" />
      <h1>{page.benefit}</h1>
      <ul>
        {page.points.slice(0, 3).map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="landing-cta">
        <a href={page.actionUrl}>{page.cta || "立即领取"}</a>
      </div>
    </main>
  );
}
```

```css
.landing-cta {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  background: #fff;
}
```

利益点使用页面上最大的文字。不要在首屏先放长篇规则。

## 相关条目

- [优惠券](../coupon/coupon.md)：主按钮若是领券，状态和防连点跟优惠券一致。
- [留资表单](../lead-form/form.md)：按钮打开的表单放在落地页下半部，首屏仍先给利益点。
- [唤端与降级](../deeplink/deeplink.md)：App 唤起失败时退回的就是这一页。

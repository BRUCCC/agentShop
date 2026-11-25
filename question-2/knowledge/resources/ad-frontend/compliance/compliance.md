# 广告标识与关闭

## 标识

文案只用「广告」或「推广」。放在素材可读的角落，对比度要够，不能写进图片里再让前端省略 DOM。屏幕阅读和审查都要能直接看到这两个字。

## 关闭按钮

可关闭的广告必须有真实的关闭按钮。点击后广告从页面消失，并且这次点击不能同时算作广告点击。

下面三种都是假关闭，不能上线：

- 按钮没有绑定关闭，点击穿透到素材。
- 图标小于 44 像素，或颜色和背景融在一起。
- 关闭后立刻再次插入同一条广告。

## 示例

```jsx
// 关闭和广告点击分开。标识始终渲染成独立文本。
export function AdFrame({ children, onClose, onAdClick }) {
  return (
    <section className="ad-frame">
      <span className="ad-badge">广告</span>
      <div onClick={onAdClick}>{children}</div>
      <button
        type="button"
        className="ad-close"
        aria-label="关闭广告"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        关闭
      </button>
    </section>
  );
}
```

`.ad-close` 的最小宽高设为 44px。不要只用一个很小的叉号图片，并且不要把它的点击委托到外层素材上。

## 相关条目

- [信息流广告卡片](../feed-card/card.md)：标识贴在封面左上角，文案固定「广告」。
- [开屏与横幅](../banner/banner.md)：跳过按钮按关闭处理，热区不小于 44 像素。

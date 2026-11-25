# 信息流广告卡片

信息流广告插在内容列表中。卡片可以沿用内容的圆角和间距，但广告身份必须单独标出来，不能只靠小号灰色字。

## 结构

1. 媒体区：图片或视频封面，比例由素材规格决定。
2. 左上角广告标识：贴在媒体区上，白字半透明底，文案固定为「广告」。
3. 标题一行，描述最多两行，超出省略。
4. 立即下载按钮放在右下，文案可被创意覆盖，缺省就是「立即下载」。

## 点击

整张卡片可点。点立即下载和点封面都算点击，去向相同。若以后加上关闭图标，关闭必须阻止冒泡，不能当成点击广告。

## 示例

```jsx
// 信息流中的一条原生广告。广告标识固定左上，主操作固定为下载。
export function AdFeedCard({ creative, onClick }) {
  const label = creative.cta || "立即下载";
  return (
    <article className="ad-feed-card" onClick={() => onClick(creative)}>
      <div className="media">
        <img src={creative.imageUrl} alt="" />
        {/* 标识不放进标题，避免和正文混在一起 */}
        <span className="ad-badge">广告</span>
      </div>
      <h3>{creative.title}</h3>
      <p>{creative.description}</p>
      <button type="button">{label}</button>
    </article>
  );
}
```

样式上 `.ad-badge` 使用 `position: absolute; left: 8px; top: 8px`。按钮使用实心主色，不要做成文字链接。

## 相关条目

- [卡片曝光](exposure.md)：整卡可点之后，露出一半并停留一秒才记一次曝光。
- [广告标识与关闭](../compliance/compliance.md)：标识必须是独立文本，关闭不能冒泡成点击。
- [素材规格与动态创意](../creative/creative.md)：媒体区比例和按钮文案的兜底来自素材模板。

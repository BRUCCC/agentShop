# 素材规格与动态创意

## 素材

信息流大图只接受 1280x720。上传预览时按 16:9 裁切展示，不要拉伸变形。视频时长超过 15秒 就拒绝，并提示剪到 15秒 以内。封面图缺失时用视频第一帧，不留空白媒体区。

## 模板变量

动态创意的标题、价格、图片都可能按商品变化。模板里只允许这三个变量：

- `{title}`：商品名，兜底文案是「精选好物」
- `{price}`：价格，兜底文案是「查看价格」
- `{image}`：图片地址，兜底用活动默认图

## 示例

```js
const FALLBACKS = {
  title: "精选好物",
  price: "查看价格",
  image: "/assets/ad-fallback.png",
};

// 用商品字段替换模板变量。空值走兜底文案，避免页面出现 {title}。
export function renderCreative(template, product = {}) {
  return template.replace(/\{(title|price|image)\}/g, (_, key) => {
    const value = product[key];
    if (value === undefined || value === null || value === "") {
      return FALLBACKS[key];
    }
    return String(value);
  });
}
```

价格已经是展示文案，例如「¥99」。前端不再自行加货币符号，避免兜底文案被拼成「¥查看价格」。

## 相关条目

- [信息流广告卡片](../feed-card/card.md)：1280x720 的图放进卡片媒体区，按钮文案用模板里的标题兜底。
- [开屏与横幅](../banner/banner.md)：开屏全屏素材同样先过这里的时长和比例，再进倒计时容器。

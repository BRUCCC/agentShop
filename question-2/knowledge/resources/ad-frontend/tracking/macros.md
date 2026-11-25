# 监测链接宏参数

投放平台下发的点击监测链接里会留下宏。前端在真正发请求前把它们换成这次点击的值。

| 宏 | 替换成 |
| --- | --- |
| `__CLICK_ID__` | 本次点击生成的点击id |
| `__TS__` | 毫秒时间戳 |
| `__OS__` | ios、android 或 other |
| `__CREATIVE_ID__` | 当前创意 id |

## 替换

先生成 clickId，再替换，再请求。同一个点击的后续转化沿用这个点击id。

```js
// 把监测链接中的宏参数换成真实值。还残留花括号宏时拒绝发送。
export function renderClickTracker(template, context) {
  const replacements = {
    __CLICK_ID__: context.clickId,
    __TS__: String(context.ts),
    __OS__: context.os,
    __CREATIVE_ID__: context.creativeId,
  };
  const url = Object.entries(replacements).reduce(
    (current, [macro, value]) => current.split(macro).join(encodeURIComponent(value)),
    template
  );
  if (/__[A-Z0-9_]+__/.test(url)) {
    throw new Error("监测链接仍有未替换的宏参数");
  }
  return url;
}
```

曝光监测如果也带时间戳宏，复用同一张表，但点击id 只出现在点击链路上。

## 相关条目

- [广告事件](events.md)：clickId 先出现在 click 事件，后续转化沿用它。
- [唤端与降级](../deeplink/deeplink.md)：深链上的 clickId 用这次替换出来的值。
- [开屏与横幅](../banner/banner.md)：点开屏素材时才生成点击并替换宏，点跳过不生成。

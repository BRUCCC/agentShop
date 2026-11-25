# 唤端与降级

唤端成功的标志不是脚本没有报错，而是页面真的进入后台。移动浏览器里，scheme 跳转失败通常没有异常，所以用超时判断。

## 流程

1. 记录点击时间，并监听 `visibilitychange`。
2. iOS 且存在 universalLink 时打开 universalLink，否则把 location 设为 scheme 深链。
3. 1.5 秒后如果页面仍可见，认为失败或用户未安装，跳到 H5 落地页。
4. 若中途页面被隐藏，清掉定时器，不再跳落地页。

## 示例

```js
// 唤起 App。超时仍停留在当前页，就退回 H5 落地页。
export function openAppOrLanding({ deepLink, universalLink, landingUrl, isIOS }) {
  let hidden = false;
  const onHide = () => {
    if (document.visibilityState === "hidden") hidden = true;
  };
  document.addEventListener("visibilitychange", onHide);
  window.location.href = isIOS && universalLink ? universalLink : deepLink;

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!hidden) window.location.href = landingUrl;
  }, 1500);
}
```

深链上要带上 clickId，保证 App 内的转化能和这次点击对齐。退回的 H5 使用落地页结构，按钮和首屏利益点不要在唤端脚本里重做一套。

## 相关条目

- [落地页结构](../landing/landing.md)：超时仍可见时打开的 H5，沿用落地页的首屏和底部按钮。
- [监测链接宏参数](../tracking/macros.md)：深链上的 clickId 来自点击监测的同一次替换。
- [开屏与横幅](../banner/banner.md)：开屏素材点击进入这里，跳过按钮不进入。

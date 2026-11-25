# 开屏与横幅

## 开屏

开屏盖住整个首屏。右上角区域从左到右是剩余秒数和跳过按钮，例如「5」和「跳过」。用户点击跳过按钮立刻关闭，不等倒计时结束。

倒计时每秒减 1，到 0 时调用和跳过相同的关闭函数，避免两套去向。素材点击才进入广告落地，点跳过按钮不能冒泡成点击。

## 横幅

横幅贴在页面顶部，高度固定，不跟随滚动放大。右侧提供关闭。关闭后把 bannerId 记到 sessionStorage，本次会话不再展示。

## 示例

```jsx
import { useEffect, useState } from "react";

// 开屏右上角倒计时。到 0 或用户点跳过按钮时关闭。
export function SplashCountdown({ seconds = 5, onSkip }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) {
      onSkip();
      return undefined;
    }
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left, onSkip]);

  return (
    <div className="splash-controls">
      <span>{left}</span>
      <button type="button" onClick={onSkip}>
        跳过
      </button>
    </div>
  );
}
```

`.splash-controls` 放在 `top: 16px; right: 16px`。按钮最小宽高 44px，和倒计时之间留出 8px，避免误触素材。

## 相关条目

- [广告标识与关闭](../compliance/compliance.md)：跳过和关闭都要挡住冒泡，不能算成广告点击。
- [唤端与降级](../deeplink/deeplink.md)：点开屏素材时先尝试唤端，失败再进落地页。
- [监测链接宏参数](../tracking/macros.md)：这次点击要先生成 clickId，再替换监测链接。

# 留资表单

字段顺序：姓名、手机号、验证码、隐私协议、提交。姓名只判断非空。手机号和协议是提交前的硬条件。

## 校验

- 手机号使用 `/^1[3-9]\d{9}$/`。空号、长度不对、第二位不在 3 到 9，都算不合法。
- 验证码使用 `/^\d{6}$/`。
- 隐私协议复选框不预勾选。未勾选时不发请求。

错误文案写在对应字段下，不要只用 alert。提交中把按钮文案改成「提交中」并禁用，失败后恢复，保留用户已填内容。

## 示例

```jsx
import { useState } from "react";

const phonePattern = /^1[3-9]\d{9}$/;

// 协议没勾选或手机号不合法时，直接返回原因，不发请求。
export function validateLead({ name, phone, code, agreed }) {
  if (!name.trim()) return "请填写姓名";
  if (!phonePattern.test(phone)) return "请填写正确的手机号";
  if (!/^\d{6}$/.test(code)) return "请填写 6 位验证码";
  if (!agreed) return "请先勾选隐私协议";
  return "";
}

export function LeadForm({ onSubmit }) {
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = validateLead({
      name: String(form.get("name") || ""),
      phone: String(form.get("phone") || ""),
      code: String(form.get("code") || ""),
      agreed,
    });
    if (error || pending) return;
    setPending(true);
    try {
      await onSubmit(Object.fromEntries(form));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="姓名" />
      <input name="phone" inputMode="numeric" placeholder="手机号" />
      <input name="code" inputMode="numeric" placeholder="验证码" />
      <label>
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        我已阅读并同意隐私协议
      </label>
      <button disabled={pending}>{pending ? "提交中" : "提交"}</button>
    </form>
  );
}
```

## 相关条目

- [落地页结构](../landing/landing.md)：表单通常接在落地页利益点下面。
- [广告事件](../tracking/events.md)：提交成功记 conversion，conversionType 用 lead，事件里不放手机号。

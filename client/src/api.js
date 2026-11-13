export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || "请求失败");
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

export function formatMoney(amount) {
  return `NT$${Number(amount).toLocaleString("zh-TW")}`;
}

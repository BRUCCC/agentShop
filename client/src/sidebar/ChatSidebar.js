import { useEffect, useState } from "react";
import { api } from "../api";

const STORAGE = {
  apiBase: "shop.chat.apiBase",
  apiKey: "shop.chat.apiKey",
  model: "shop.chat.model",
  messages: "shop.chat.messages",
  cartId: "shop.chat.cartId",
};

function readStorage(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // 浏览器禁止存储时，这一轮对话仍可发送。
  }
}

export default function ChatSidebar({ open }) {
  const [apiBase, setApiBase] = useState(() => readStorage(STORAGE.apiBase));
  const [apiKey, setApiKey] = useState(() => readStorage(STORAGE.apiKey));
  const [model, setModel] = useState(() => readStorage(STORAGE.model));
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(readStorage(STORAGE.messages) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [cartId, setCartId] = useState(() => readStorage(STORAGE.cartId));
  const [cartCount, setCartCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!cartId) {
      setCartCount(0);
      return;
    }
    api(`/api/carts/${cartId}`)
      .then((cart) => setCartCount(cart.status === "open" ? cart.count : 0))
      .catch(() => setCartCount(0));
  }, [cartId]);

  function remember(key, value, setter) {
    setter(value);
    writeStorage(key, value);
  }

  async function send(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || pending || !apiKey.trim()) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setError("");
    setPending(true);
    writeStorage(STORAGE.messages, JSON.stringify(next));
    try {
      const result = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          api_base: apiBase.trim(),
          model: model.trim(),
          api_key: apiKey,
          cart_id: cartId || null,
          messages: next,
        }),
      });
      const saved = [...next, { role: "assistant", content: result.reply }];
      writeStorage(STORAGE.messages, JSON.stringify(saved));
      writeStorage(STORAGE.cartId, result.cart_id || "");
      if (result.changed) {
        window.location.reload();
        return;
      }
      setMessages(saved);
      setCartId(result.cart_id || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <h2>对话</h2>
      <label className="field">
        模型 API
        <input
          value={apiBase}
          placeholder="https://api.openai.com/v1"
          onChange={(event) => remember(STORAGE.apiBase, event.target.value, setApiBase)}
        />
      </label>
      <label className="field">
        模型名称
        <input
          value={model}
          placeholder="模型名称"
          onChange={(event) => remember(STORAGE.model, event.target.value, setModel)}
        />
      </label>
      <label className="field">
        API key
        <input
          type="password"
          value={apiKey}
          autoComplete="off"
          onChange={(event) => remember(STORAGE.apiKey, event.target.value, setApiKey)}
        />
      </label>
      <p className="meta">对话购物车 {cartCount} 件。只说加入购物车时不会下单。</p>
      <div className="transcript">
        {messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={message.role === "user" ? "mine" : "reply"}>
            {message.content}
          </p>
        ))}
        {pending ? <p className="meta">正在回复</p> : null}
      </div>
      {error ? <p className="message">{error}</p> : null}
      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          aria-label="对话输入"
          placeholder={apiKey.trim() ? "查商品、报价、加购或下单" : "填写 API key 后才能发送"}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={pending || !apiKey.trim() || !draft.trim()}>发送</button>
      </form>
    </aside>
  );
}

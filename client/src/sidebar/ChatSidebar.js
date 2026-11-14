import { useEffect, useState } from "react";
import { api, formatMoney } from "../api";

const STORAGE = {
  messages: "shop.chat.messages",
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
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-chat");
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(readStorage(STORAGE.messages) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [cartCount, setCartCount] = useState(0);
  const [offers, setOffers] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    for (const key of ["shop.chat.apiKey", "shop.chat.apiBase", "shop.chat.model"]) {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch {
        // 清不掉旧密钥时，也不再写入新的。
      }
    }
    api("/api/cart")
      .then((cart) => {
        setCartCount(cart.count || 0);
        setOffers(cart.offers || null);
      })
      .catch(() => setCartCount(0));
  }, []);

  async function send(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || pending || !apiKey.trim() || !apiBase.trim() || !model.trim()) return;
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
          api_key: apiKey,
          api_base: apiBase.trim(),
          model: model.trim(),
          messages: next,
        }),
      });
      const saved = [...next, { role: "assistant", content: result.reply }];
      writeStorage(STORAGE.messages, JSON.stringify(saved));
      if (result.changed) {
        window.location.reload();
        return;
      }
      setMessages(saved);
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
        API key
        <input
          type="password"
          name="shop-api-key"
          value={apiKey}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <label className="field">
        模型地址
        <input
          type="text"
          name="shop-model-base"
          value={apiBase}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setApiBase(event.target.value)}
        />
      </label>
      <label className="field">
        模型名称
        <input
          type="text"
          name="shop-model"
          value={model}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setModel(event.target.value)}
        />
      </label>
      <p className="meta">和页面是同一辆购物车，现有 {cartCount} 件。只说加入购物车时不会下单。</p>
      {offers ? (
        <p className="offer">
          通过对话栏下单额外优惠：满减后的商品金额再享 {offers.agent_percent} 折，运费不参加。
          {offers.agent_extra > 0 ? ` 这辆车还可再省 ${formatMoney(offers.agent_extra)}。` : ""}
        </p>
      ) : null}
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
        <button type="submit" disabled={pending || !apiKey.trim() || !apiBase.trim() || !model.trim() || !draft.trim()}>发送</button>
      </form>
    </aside>
  );
}

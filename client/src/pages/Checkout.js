import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, formatMoney } from "../api";

function Money({ quote }) {
  if (!quote) return null;
  return (
    <div className="summary">
      <p>商品小计 {formatMoney(quote.subtotal)}</p>
      <p>优惠 {formatMoney(quote.discount)}</p>
      <p>运费 {formatMoney(quote.shipping_fee)}</p>
      <p>应付 {formatMoney(quote.total)}</p>
    </div>
  );
}

function Lines({ items }) {
  return (
    <ul className="lines confirm">
      {items.map((item) => (
        <li key={item.product_id}>
          <div>
            <strong>{item.name}</strong>
            <p className="meta">{item.product_id} · {formatMoney(item.unit_price)} × {item.quantity}</p>
          </div>
          <strong>{formatMoney(item.unit_price * item.quantity)}</strong>
        </li>
      ))}
    </ul>
  );
}

export default function Checkout() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const [cart, setCart] = useState(null);
  const [quote, setQuote] = useState(null);
  const [handoff, setHandoff] = useState(null);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (orderId) {
      api(`/api/orders/${orderId}`).then(setOrder).catch((err) => setError(err.message));
      return;
    }
    if (token) {
      api(`/api/handoffs/${token}`).then(setHandoff).catch((err) => setError(err.message));
      return;
    }
    api("/api/cart")
      .then(async (loaded) => {
        setCart(loaded);
        if (!loaded.items.length) return;
        const priced = await api("/api/quotes", {
          method: "POST",
          body: JSON.stringify({
            channel: loaded.channel,
            items: loaded.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
          }),
        });
        setQuote(priced);
      })
      .catch((err) => setError(err.message));
  }, [orderId, token]);

  async function pay(cartId) {
    setPending(true);
    setError("");
    try {
      const created = await api(`/api/carts/${cartId}/checkout`, { method: "POST", body: "{}" });
      window.location.assign(`/checkout?order=${created.id}`);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  if (order) {
    return (
      <section>
        <p className="crumb"><Link to="/">首页</Link> / 订单</p>
        <h1>付款已模拟完成</h1>
        <p>订单号 {order.id}</p>
        <Lines items={order.items} />
        <Money quote={order} />
      </section>
    );
  }

  if (token) {
    const finished = handoff?.ordered ? handoff.order : null;
    const quoteForPage = finished || handoff?.quote;
    const shortages = handoff?.shortages || [];
    return (
      <section>
        <p className="crumb"><Link to="/">首页</Link> / 确认</p>
        <h1>确认订单</h1>
        {error ? <p className="message">{error}</p> : null}
        {!handoff && !error ? <p>正在读取交接</p> : null}
        {finished ? <p>订单号 {finished.id}</p> : null}
        {handoff && !handoff.ordered && handoff.expired ? <p>锁价已过期，下面是按当前目录重新计算的金额。</p> : null}
        {quoteForPage ? <Lines items={quoteForPage.items} /> : null}
        {shortages.length ? (
          <p className="message">
            缺少：{shortages.map((item) => `${item.name} 需要 ${item.requested} 件，现有 ${item.available} 件`).join("；")}
          </p>
        ) : null}
        <Money quote={quoteForPage} />
        {handoff && !finished ? (
          <button type="button" disabled={pending || shortages.length || !quoteForPage} onClick={() => pay(handoff.cart_id)}>
            模拟付款
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section>
      <p className="crumb"><Link to="/cart">购物车</Link> / 确认</p>
      <h1>确认订单</h1>
      {error ? <p className="message">{error}</p> : null}
      {!cart ? <p>正在读取购物车</p> : null}
      {cart && !cart.items.length ? <p>购物车是空的，无法结账。</p> : null}
      {cart && cart.items.length ? (
        <>
          <Lines items={cart.items} />
          <p className="meta">没有预勾任何加购。优惠和运费来自报价接口。</p>
          <Money quote={quote} />
          <button type="button" disabled={pending || !quote} onClick={() => pay(cart.id)}>模拟付款</button>
        </>
      ) : null}
    </section>
  );
}

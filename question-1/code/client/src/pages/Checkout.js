import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, formatMoney } from "../api";
import { useActor } from "../actor";

function Money({ quote }) {
  if (!quote) return <p className="meta">正在计算金额</p>;
  return (
    <dl className="checkout-totals">
      <div>
        <dt>商品小计</dt>
        <dd>{formatMoney(quote.subtotal)}</dd>
      </div>
      <div>
        <dt>优惠</dt>
        <dd>{formatMoney(quote.discount)}</dd>
      </div>
      <div>
        <dt>运费</dt>
        <dd>{formatMoney(quote.shipping_fee)}</dd>
      </div>
      <div className="checkout-due">
        <dt>应付</dt>
        <dd>{formatMoney(quote.total)}</dd>
      </div>
    </dl>
  );
}

function Lines({ items }) {
  return (
    <ul className="checkout-lines">
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

function Frame({ crumb, title, note, error, extra, items, quote, action }) {
  return (
    <section className="checkout">
      <p className="crumb">{crumb}</p>
      <h1>{title}</h1>
      {error ? <p className="message">{error}</p> : null}
      {extra}
      {items ? (
        <div className="checkout-layout">
          <Lines items={items} />
          <aside className="checkout-panel">
            <h2>结算</h2>
            {note ? <p className="meta">{note}</p> : null}
            <Money quote={quote} />
            {action}
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export default function Checkout() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const itemQuery = params.get("items");
  const actor = useActor();
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
        const wanted = itemQuery;
        const ids = wanted ? wanted.split(",").filter(Boolean) : null;
        const chosen = ids ? loaded.items.filter((item) => ids.includes(item.product_id)) : loaded.items;
        if (ids && chosen.length !== ids.length) {
          setError("有的商品不在购物车里");
        }
        setCart({ ...loaded, items: chosen });
        if (!chosen.length) return;
        const full = chosen.length === loaded.items.length;
        if (full && loaded.lock?.quote) {
          setQuote(loaded.lock.quote);
          return;
        }
        const priced = await api("/api/quotes", {
          method: "POST",
          body: JSON.stringify({
            channel: actor,
            items: chosen.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
          }),
        });
        setQuote(priced);
      })
      .catch((err) => setError(err.message));
  }, [orderId, token, itemQuery, actor]);

  async function pay(cartId, productIds) {
    setPending(true);
    setError("");
    try {
      const created = await api(`/api/carts/${cartId}/checkout`, {
        method: "POST",
        body: JSON.stringify(productIds ? { product_ids: productIds } : {}),
      });
      window.location.assign(`/checkout?order=${created.id}`);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  if (order) {
    return (
      <Frame
        crumb={<><Link to="/">首页</Link> / 订单</>}
        title="付款已模拟完成"
        note={`订单号 ${order.id}`}
        items={order.items}
        quote={order}
      />
    );
  }

  if (token) {
    const finished = handoff?.ordered ? handoff.order : null;
    const quoteForPage = finished || handoff?.quote;
    const shortages = handoff?.shortages || [];
    const notes = [
      finished ? `订单号 ${finished.id}` : "",
      handoff && !handoff.ordered && handoff.expired ? "锁价已过期，金额按当前目录重新计算。" : "",
    ].filter(Boolean);
    return (
      <Frame
        crumb={<><Link to="/">首页</Link> / 确认</>}
        title="确认订单"
        note={notes.join(" ")}
        error={error}
        extra={!handoff && !error ? <p className="meta">正在读取交接</p> : null}
        items={quoteForPage?.items}
        quote={quoteForPage}
        action={handoff && !finished ? (
          <>
            {shortages.length ? (
              <p className="message">
                缺少：{shortages.map((item) => `${item.name} 需要 ${item.requested} 件，现有 ${item.available} 件`).join("；")}
              </p>
            ) : null}
            <button type="button" className="checkout-pay" disabled={pending || shortages.length || !quoteForPage} onClick={() => pay(handoff.cart_id)}>
              模拟付款
            </button>
          </>
        ) : null}
      />
    );
  }

  return (
    <Frame
      crumb={<><Link to="/cart">购物车</Link> / 确认</>}
      title="确认订单"
      note={cart?.items.length ? "优惠和运费按这里列出的商品计算。" : ""}
      error={error}
      extra={!cart ? <p className="meta">正在读取购物车</p> : cart.items.length ? null : <p>没有选择要结账的商品。</p>}
      items={cart?.items.length ? cart.items : null}
      quote={quote}
      action={cart?.items.length ? (
        <button
          type="button"
          className="checkout-pay"
          disabled={pending || !quote}
          onClick={() => pay(cart.id, cart.items.map((item) => item.product_id))}
        >
          模拟付款
        </button>
      ) : null}
    />
  );
}

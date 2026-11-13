import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatMoney } from "../api";

export default function Checkout() {
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const [cart, setCart] = useState(null);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (orderId) {
      api(`/api/orders/${orderId}`).then(setOrder).catch((err) => setError(err.message));
      return;
    }
    api("/api/cart").then(setCart).catch((err) => setError(err.message));
  }, [orderId]);

  async function pay() {
    setPending(true);
    setError("");
    try {
      const created = await api(`/api/carts/${cart.id}/checkout`, { method: "POST", body: "{}" });
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
        <ul className="lines">
          {order.items.map((item) => (
            <li key={item.product_id}>
              <div>
                <strong>{item.name}</strong>
                <p className="meta">{item.product_id} · {formatMoney(item.unit_price)} × {item.quantity}</p>
              </div>
              <strong>{formatMoney(item.unit_price * item.quantity)}</strong>
            </li>
          ))}
        </ul>
        <p>标价合计 {formatMoney(order.total)}</p>
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
          <ul className="lines">
            {cart.items.map((item) => (
              <li key={item.product_id}>
                <div>
                  <strong>{item.name}</strong>
                  <p className="meta">{item.product_id} · {formatMoney(item.unit_price)} × {item.quantity}</p>
                </div>
                <strong>{formatMoney(item.line_total)}</strong>
              </li>
            ))}
          </ul>
          <div className="summary">
            <p>标价合计 {formatMoney(cart.sticker_total)}</p>
            <p className="meta">没有预勾任何加购。优惠和运费还没有接入，这次按标价模拟付款。</p>
            <button type="button" disabled={pending} onClick={pay}>模拟付款</button>
          </div>
        </>
      ) : null}
    </section>
  );
}

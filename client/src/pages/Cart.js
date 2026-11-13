import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatMoney } from "../api";

export default function Cart() {
  const [cart, setCart] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/cart").then(setCart).catch((err) => setError(err.message));
  }, []);

  async function update(productId, quantity) {
    setError("");
    try {
      await api(`/api/carts/${cart.id}/items`, {
        method: "PUT",
        body: JSON.stringify({ product_id: productId, quantity }),
      });
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !cart) return <p className="message">{error}</p>;
  if (!cart) return <p className="message">正在读取购物车</p>;

  return (
    <section>
      <p className="crumb"><Link to="/">首页</Link> / 购物车</p>
      <h1>购物车</h1>
      {error ? <p className="message">{error}</p> : null}
      {!cart.items.length ? <p>购物车还是空的。</p> : null}
      <ul className="lines">
        {cart.items.map((item) => (
          <li key={item.product_id}>
            <div>
              <Link to={`/products/${item.product_id}`}>{item.name}</Link>
              <p className="meta">{item.product_id} · {formatMoney(item.unit_price)}</p>
            </div>
            <label>
              数量
              <input
                type="number"
                min="0"
                defaultValue={item.quantity}
                onBlur={(event) => {
                  const next = Math.max(0, Number(event.target.value) || 0);
                  if (next !== item.quantity) update(item.product_id, next);
                }}
              />
            </label>
            <strong>{formatMoney(item.line_total)}</strong>
            <button type="button" onClick={() => update(item.product_id, 0)}>移除</button>
          </li>
        ))}
      </ul>
      {cart.items.length ? (
        <div className="summary">
          <p>标价合计 {formatMoney(cart.sticker_total)}</p>
          {cart.offers ? (
            <p className="offer">
              {cart.offers.discount_qualified
                ? `已满 ${formatMoney(cart.offers.discount_threshold)}，可减 ${formatMoney(cart.offers.discount_amount)}`
                : `差 ${formatMoney(cart.offers.discount_gap)} 可享折扣`}
            </p>
          ) : null}
          <Link className="button" to="/checkout">去结账</Link>
        </div>
      ) : null}
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatMoney } from "../api";

export default function Cart() {
  const [cart, setCart] = useState(null);
  const [selected, setSelected] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/cart")
      .then((loaded) => {
        setCart(loaded);
        setSelected(loaded.items.map((item) => item.product_id));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!cart) return undefined;
    const items = cart.items.filter((item) => selected.includes(item.product_id));
    if (!items.length) {
      setQuote(null);
      return undefined;
    }
    let cancel = false;
    api("/api/quotes", {
      method: "POST",
      body: JSON.stringify({
        channel: "human",
        items: items.map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
      }),
    })
      .then((priced) => {
        if (!cancel) setQuote(priced);
      })
      .catch((err) => {
        if (!cancel) setError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, [cart, selected]);

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
  const allSelected = cart.items.length > 0 && selected.length === cart.items.length;

  function toggle(productId) {
    setSelected((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
  }

  return (
    <section>
      <p className="crumb"><Link to="/">首页</Link> / 购物车</p>
      <h1>购物车</h1>
      {error ? <p className="message">{error}</p> : null}
      {!cart.items.length ? <p>购物车还是空的。</p> : null}
      <ul className="lines">
        {cart.items.length ? (
          <li className="pick-all">
            <label>
              <input
                className="check"
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : cart.items.map((item) => item.product_id))}
              />
              全选
            </label>
          </li>
        ) : null}
        {cart.items.map((item) => (
          <li key={item.product_id}>
            <div className="pick">
              <input
                className="check"
                type="checkbox"
                aria-label={`选择 ${item.name}`}
                checked={selected.includes(item.product_id)}
                onChange={() => toggle(item.product_id)}
              />
              <div>
                <Link to={`/products/${item.product_id}`}>{item.name}</Link>
                <p className="meta">{item.product_id} · {formatMoney(item.unit_price)}</p>
              </div>
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
          <p>标价合计 {quote ? formatMoney(quote.subtotal) : "请选择要结账的商品"}</p>
          {quote ? <p>优惠 {formatMoney(quote.discount)}</p> : null}
          {quote?.offers ? (
            <p className="offer">
              {quote.offers.discount_qualified
                ? `已满 ${formatMoney(quote.offers.discount_threshold)}，可减 ${formatMoney(quote.offers.discount_amount)}`
                : `差 ${formatMoney(quote.offers.discount_gap)} 可享折扣`}
            </p>
          ) : null}
          {quote ? <p>运费 {formatMoney(quote.shipping_fee)}</p> : null}
          {quote?.offers ? (
            <p className="offer">
              {quote.offers.shipping_qualified
                ? `已满 ${formatMoney(quote.offers.shipping_threshold)}，免运费`
                : `差 ${formatMoney(quote.offers.shipping_gap)} 可免运费`}
            </p>
          ) : null}
          {quote ? <p>应付 {formatMoney(quote.total)}</p> : null}
          {selected.length ? (
            <Link className="button" to={`/checkout?items=${selected.join(",")}`}>去结账</Link>
          ) : (
            <span className="button disabled">去结账</span>
          )}
        </div>
      ) : null}
    </section>
  );
}

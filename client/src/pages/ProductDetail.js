import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatMoney } from "../api";
import { useActor } from "../actor";

export default function ProductDetail() {
  const { id } = useParams();
  const actor = useActor();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api(`/api/products/${id}`)
      .then((result) => {
        setProduct(result);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [id]);

  async function addToCart() {
    setPending(true);
    setError("");
    try {
      let cart = await api("/api/cart");
      if (!cart.id) cart = await api("/api/carts", { method: "POST", body: JSON.stringify({ channel: actor }) });
      await api(`/api/carts/${cart.id}/items`, {
        method: "PUT",
        body: JSON.stringify({ product_id: id, quantity }),
      });
      window.location.assign("/cart");
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  if (error && !product) return <p className="message">{error}</p>;
  if (!product) return <p className="message">正在读取商品</p>;

  const specs = Object.entries(product.specs || {});

  return (
    <article>
      <p className="crumb"><Link to="/">首页</Link> / {product.name}</p>
      <div className="detail">
        <div className="detail-media"><span>{product.category}</span></div>
        <div>
          <h1>{product.name}</h1>
          <p className="meta">{product.brand} · {product.id}</p>
          <p className="price large">{formatMoney(product.price)}</p>
          <p>{product.sellable ? `可售 ${product.available} 件` : "暂时缺货"}</p>
          <div className="buy-row">
            <label>
              数量
              <input
                type="number"
                min="1"
                max={product.available || 1}
                value={quantity}
                disabled={!product.sellable}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <button type="button" disabled={!product.sellable || pending} onClick={addToCart}>
              加入购物车
            </button>
          </div>
          {error ? <p className="message">{error}</p> : null}
        </div>
      </div>
      <section className="panel">
        <h2>说明</h2>
        <p>{product.description}</p>
      </section>
      <section className="panel">
        <h2>规格</h2>
        <dl className="specs">
          {specs.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="panel">
        <h2>评论</h2>
        {(product.reviews || []).map((review) => (
          <article className="review" key={`${review.user}-${review.created_at}`}>
            <header>
              <strong>{review.user}</strong>
              <span>{review.rating} 分 · {review.created_at}</span>
            </header>
            <p>{review.content}</p>
          </article>
        ))}
      </section>
    </article>
  );
}

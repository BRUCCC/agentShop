import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatMoney } from "../api";

const PAGE_SIZE = 20;

export default function ProductList() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const offset = Number(params.get("offset") || 0);
  const [offers, setOffers] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");

  useEffect(() => {
    api("/api/offers").then(setOffers).catch(() => setOffers(null));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    query.set("limit", String(PAGE_SIZE));
    query.set("offset", String(offset));
    api(`/api/products?${query}`)
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [q, offset]);

  async function addToCart(product) {
    setPendingId(product.id);
    setError("");
    try {
      let cart = await api("/api/cart");
      if (!cart.id) cart = await api("/api/carts", { method: "POST", body: JSON.stringify({ channel: "human" }) });
      const existing = cart.items.find((item) => item.product_id === product.id);
      await api(`/api/carts/${cart.id}/items`, {
        method: "PUT",
        body: JSON.stringify({ product_id: product.id, quantity: (existing?.quantity || 0) + 1 }),
      });
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setPendingId("");
    }
  }

  function goOffset(next) {
    const nextParams = new URLSearchParams(params);
    if (next <= 0) nextParams.delete("offset");
    else nextParams.set("offset", String(next));
    setParams(nextParams);
  }

  return (
    <section>
      <p className="crumb">首页 / 全部商品</p>
      {offers ? (
        <p className="offer">
          折前小计满 {formatMoney(offers.discount_threshold)} 减 {formatMoney(offers.discount_amount)}。
          满 {formatMoney(offers.shipping_threshold)} 免运费，未满运费 {formatMoney(offers.shipping_fee)}。
          通过对话栏下单，满减后再享 {offers.agent_percent} 折。
        </p>
      ) : null}
      <div className="list-head">
        <h1>{q ? `搜索「${q}」` : "全部商品"}</h1>
        <p>{data ? `共 ${data.total} 件，按推荐分数排序` : "正在读取商品"}</p>
      </div>
      {error ? <p className="message">{error}</p> : null}
      <div className="grid">
        {(data?.items || []).map((product) => (
          <article className="card" key={product.id}>
            <Link className="thumb" to={`/products/${product.id}`}>
              <span>{product.category}</span>
              {!product.sellable ? <em>售罄</em> : null}
            </Link>
            <div className="card-body">
              <Link to={`/products/${product.id}`}>{product.name}</Link>
              <p className="meta">{product.brand}</p>
              <p className="price">{formatMoney(product.price)}</p>
            </div>
            <button
              className="add"
              type="button"
              disabled={!product.sellable || pendingId === product.id}
              onClick={() => addToCart(product)}
            >
              {product.sellable ? "加入购物车" : "暂时缺货"}
            </button>
          </article>
        ))}
      </div>
      {data && data.total > PAGE_SIZE ? (
        <div className="pager">
          <button type="button" disabled={offset <= 0} onClick={() => goOffset(offset - PAGE_SIZE)}>上一页</button>
          <button type="button" disabled={offset + PAGE_SIZE >= data.total} onClick={() => goOffset(offset + PAGE_SIZE)}>下一页</button>
        </div>
      ) : null}
    </section>
  );
}

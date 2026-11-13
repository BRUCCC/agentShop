import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "./api";
import ProductList from "./pages/ProductList";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";

export default function App() {
  const navigate = useNavigate();
  const [cartCount, setCartCount] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api("/api/cart").then((cart) => setCartCount(cart.count || 0)).catch(() => setCartCount(0));
  }, []);

  function onSearch(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    navigate(`/${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <Link className="logo" to="/">Agent-Ready</Link>
          <nav className="nav">
            <Link to="/">全部商品</Link>
          </nav>
          <form className="search" onSubmit={onSearch}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索商品"
              aria-label="搜索商品"
            />
            <button type="submit">搜索</button>
          </form>
          <Link className="cart-link" to="/cart">
            购物车
            <span>{cartCount}</span>
          </Link>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<ProductList />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
        </Routes>
      </main>
      <footer className="footer">标价来自商品目录。优惠和运费还没有接入。</footer>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { ActorContext, syncActor } from "./actor";
import ProductList from "./pages/ProductList";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import ChatSidebar from "./sidebar/ChatSidebar";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [cartCount, setCartCount] = useState(0);
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("human");
  const [chatOpen, setChatOpen] = useState(() => window.matchMedia("(min-width: 901px)").matches);

  useEffect(() => {
    syncActor().then(setActor).catch(() => setActor("human"));
  }, [location.search]);

  useEffect(() => {
    api("/api/cart").then((cart) => setCartCount(cart.count || 0)).catch(() => setCartCount(0));
  }, [actor]);

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
          <button type="button" className="chat-toggle" onClick={() => setChatOpen((value) => !value)}>
            对话
          </button>
        </div>
      </header>
      {actor === "agent" ? (
        <p className="actor-banner">当前是 AI 下单。满减后再享 95 折，运费不参加。普通访问没有这层优惠。</p>
      ) : null}
      <div className="shell">
        <main className="main">
          <ActorContext.Provider value={actor}>
          <Routes>
            <Route path="/" element={<ProductList />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/:token" element={<Checkout />} />
          </Routes>
          </ActorContext.Provider>
        </main>
        <ChatSidebar open={chatOpen} />
      </div>
      <footer className="footer">标价来自商品目录。优惠和运费只出现在报价和确认页。</footer>
    </div>
  );
}

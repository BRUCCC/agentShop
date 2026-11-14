const fs = require("fs");
const path = require("path");
const express = require("express");
const webpack = require("webpack");
const webpackDevMiddleware = require("webpack-dev-middleware");
const webpackHotMiddleware = require("webpack-hot-middleware");
const config = require("../webpack.config");
const { offerRules, offerForLines } = require("../src/domain/pricing");
const { catalog, searchProducts, findProduct, detailItem } = require("../src/domain/catalog");
const { heldQuantities, soldQuantities, releaseExpired } = require("../src/db");
const { createCart, getCart, getCartRow, setItem, quoteProducts, createHandoff, getHandoff, checkout, orderPayload } = require("../src/domain/cart");
const { chat } = require("../src/chat");

function loadLocalEnv() {
  const file = path.join(__dirname, "../.env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt === -1) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json());

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const part = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

function setCartCookie(res, id) {
  res.setHeader("Set-Cookie", `cart_id=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearCartCookie(res) {
  res.setHeader("Set-Cookie", "cart_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function quantityLookup(load) {
  const map = load();
  return (productId) => map.get(productId) || 0;
}

function parseLimit(value) {
  const number = Number(value);
  if (!value || Number.isNaN(number)) return 8;
  return Math.min(20, Math.max(1, Math.floor(number)));
}

function parseOffset(value) {
  const number = Number(value);
  if (!value || Number.isNaN(number) || number < 0) return 0;
  return Math.floor(number);
}

app.get("/api/offers", (req, res) => {
  res.json(offerRules());
});

app.get("/api/products", (req, res) => {
  const result = searchProducts({
    q: req.query.q,
    brand: req.query.brand,
    category: req.query.category,
    inStock: req.query.in_stock === "1",
    limit: parseLimit(req.query.limit),
    offset: parseOffset(req.query.offset),
    held: quantityLookup(heldQuantities),
    sold: quantityLookup(soldQuantities),
  });
  res.json({ store: catalog().store, currency: catalog().currency, ...result });
});

app.get("/api/products/:id", (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return sendError(res, 404, "PRODUCT_NOT_FOUND", "没有这个商品");
  const held = quantityLookup(heldQuantities);
  const sold = quantityLookup(soldQuantities);
  res.json(detailItem(product, held(product.id), sold(product.id)));
});

app.get("/api/cart", (req, res) => {
  const id = readCookie(req, "cart_id");
  const row = id ? getCartRow(id) : null;
  if (!row || row.status !== "open") {
    return res.json({ id: null, channel: "human", status: "open", count: 0, sticker_total: 0, offers: offerForLines([]), items: [] });
  }
  res.json(getCart(id));
});

app.post("/api/carts", (req, res) => {
  const channel = req.body?.channel === "agent" ? "agent" : "human";
  const cart = createCart(channel);
  if (channel === "human") setCartCookie(res, cart.id);
  res.status(201).json(cart);
});

app.get("/api/carts/:id", (req, res) => {
  const cart = getCart(req.params.id);
  if (!cart) return sendError(res, 404, "CART_NOT_FOUND", "购物车不存在");
  res.json(cart);
});

app.put("/api/carts/:id/items", (req, res) => {
  const quantity = Number(req.body?.quantity);
  const productId = req.body?.product_id;
  if (!productId || !Number.isInteger(quantity) || quantity < 0) {
    return sendError(res, 400, "VALIDATION", "需要商品 id 和非负整数数量");
  }
  try {
    res.json(setItem(req.params.id, productId, quantity));
  } catch (error) {
    sendError(res, error.status || 500, error.code || "VALIDATION", error.message);
  }
});

app.post("/api/quotes", (req, res) => {
  try {
    res.json(quoteProducts(req.body?.channel, req.body?.items));
  } catch (error) {
    sendError(res, error.status || 500, error.code || "VALIDATION", error.message);
  }
});

app.post("/api/carts/:id/handoff", (req, res) => {
  try {
    res.status(201).json(createHandoff(req.params.id));
  } catch (error) {
    sendError(res, error.status || 500, error.code || "VALIDATION", error.message);
  }
});

app.get("/api/handoffs/:token", (req, res) => {
  const handoff = getHandoff(req.params.token);
  if (!handoff) return sendError(res, 404, "CART_NOT_FOUND", "交接链接不存在");
  res.json(handoff);
});

app.post("/api/chat", async (req, res) => {
  try {
    const result = await chat({
      apiKey: req.body?.api_key,
      apiBase: req.body?.api_base,
      model: req.body?.model,
      cartId: readCookie(req, "cart_id"),
      messages: req.body?.messages,
    });
    if (result.ordered) clearCartCookie(res);
    else if (result.cart_id) setCartCookie(res, result.cart_id);
    res.json({ reply: result.reply, changed: result.changed, usage: result.usage });
  } catch (error) {
    res.status(error.status || 500).json({
      error: { code: error.code || "MODEL_UNAVAILABLE", message: error.message },
      ...(error.usage ? { usage: error.usage } : {}),
    });
  }
});

app.post("/api/carts/:id/checkout", (req, res) => {
  try {
    const order = checkout(req.params.id);
    if (readCookie(req, "cart_id") === req.params.id) clearCartCookie(res);
    res.status(201).json(order);
  } catch (error) {
    sendError(res, error.status || 500, error.code || "VALIDATION", error.message);
  }
});

app.get("/api/orders/:id", (req, res) => {
  const order = orderPayload(req.params.id);
  if (!order) return sendError(res, 404, "VALIDATION", "没有这张订单");
  res.json(order);
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  sendError(res, 500, "VALIDATION", "服务暂时无法完成这个请求");
});

function listen() {
  app.listen(PORT, () => {
    console.log(`shop http://localhost:${PORT}`);
  });
}

releaseExpired();
setInterval(releaseExpired, 60 * 1000).unref();

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "../dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
  listen();
} else {
  const devConfig = {
    ...config,
    entry: ["webpack-hot-middleware/client?reload=true", "./client/src/index.js"],
    plugins: [...config.plugins, new webpack.HotModuleReplacementPlugin()],
  };
  const compiler = webpack(devConfig);
  const devMiddleware = webpackDevMiddleware(compiler, { publicPath: "/" });
  app.use(devMiddleware);
  app.use(webpackHotMiddleware(compiler));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    devMiddleware.waitUntilValid(() => {
      const filename = path.join(compiler.outputPath, "index.html");
      devMiddleware.context.outputFileSystem.readFile(filename, (error, file) => {
        if (error) return next(error);
        res.set("Content-Type", "text/html; charset=utf-8");
        res.send(file);
      });
    });
  });
  listen();
}

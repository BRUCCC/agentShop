const crypto = require("crypto");
const { db } = require("../db");
const { findProduct, availability } = require("./catalog");
const { priceOrder, offerForLines } = require("./pricing");

function nowIso() {
  return new Date().toISOString();
}

function setCartChannel(cartId, channel) {
  if (channel !== "human" && channel !== "agent") return;
  db.prepare("UPDATE carts SET channel = ?, updated_at = ? WHERE id = ? AND status = 'open'").run(channel, nowIso(), cartId);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function heldQty(productId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM reservations
       WHERE product_id = ? AND status = 'held' AND expires_at > ?`,
    )
    .get(productId, nowIso());
  return Number(row.qty);
}

function soldQty(productId) {
  const row = db
    .prepare("SELECT COALESCE(SUM(quantity), 0) AS qty FROM order_items WHERE product_id = ?")
    .get(productId);
  return Number(row.qty);
}

function heldQtyExceptCart(productId, cartId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM reservations
       WHERE product_id = ? AND status = 'held' AND expires_at > ? AND cart_id != ?`,
    )
    .get(productId, nowIso(), cartId);
  return Number(row.qty);
}

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function releaseHolds(cartId) {
  db.prepare("UPDATE reservations SET status = 'released' WHERE cart_id = ? AND status = 'held'").run(cartId);
}

function createCart(channel) {
  const id = newId("cart");
  const now = nowIso();
  db.prepare(
    `INSERT INTO carts (id, channel, status, handoff_token, created_at, updated_at)
     VALUES (?, ?, 'open', NULL, ?, ?)`,
  ).run(id, channel, now, now);
  return getCart(id);
}

function getCartRow(id) {
  return db.prepare("SELECT * FROM carts WHERE id = ?").get(id);
}

function getCart(id) {
  const cart = getCartRow(id);
  if (!cart) return null;
  const rows = db.prepare("SELECT product_id, quantity FROM cart_items WHERE cart_id = ? ORDER BY product_id").all(id);
  const items = rows.map((row) => {
    const product = findProduct(row.product_id);
    if (!product) {
      return {
        product_id: row.product_id,
        name: "商品不存在",
        quantity: row.quantity,
        unit_price: 0,
        line_total: 0,
        available: 0,
        sellable: false,
        missing: true,
      };
    }
    const stock = availability(product, heldQty(product.id), soldQty(product.id));
    return {
      product_id: product.id,
      name: product.name,
      quantity: row.quantity,
      unit_price: product.price,
      line_total: product.price * row.quantity,
      ...stock,
      missing: false,
    };
  });
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const stickerTotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const holds = activeHolds(cart.id);
  const locked = holds.length && holdsMatch({ items }, holds);
  return {
    id: cart.id,
    channel: cart.channel,
    status: cart.status,
    count,
    sticker_total: stickerTotal,
    offers: offerForLines(items),
    items,
    lock: locked
      ? {
          expires_at: holds[0].expires_at,
          url: cart.handoff_token ? `/checkout/${cart.handoff_token}` : null,
          quote: JSON.parse(holds[0].quote_snapshot),
        }
      : null,
  };
}

function setItem(cartId, productId, quantity) {
  const cart = getCartRow(cartId);
  if (!cart) {
    const error = new Error("购物车不存在");
    error.status = 404;
    error.code = "CART_NOT_FOUND";
    throw error;
  }
  if (cart.status !== "open") {
    const error = new Error("这个购物车已经结账");
    error.status = 409;
    error.code = "VALIDATION";
    throw error;
  }
  const product = findProduct(productId);
  if (!product) {
    const error = new Error("没有这个商品");
    error.status = 404;
    error.code = "PRODUCT_NOT_FOUND";
    throw error;
  }
  if (quantity === 0) {
    db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?").run(cartId, productId);
  } else {
    const stock = availability(product, heldQtyExceptCart(product.id, cartId), soldQty(product.id));
    if (!stock.sellable) {
      const error = new Error(`${product.name} 现在不能购买`);
      error.status = 409;
      error.code = "NOT_SELLABLE";
      throw error;
    }
    if (quantity > stock.available) {
      const error = new Error(`${product.name} 库存只剩 ${stock.available} 件`);
      error.status = 409;
      error.code = "OUT_OF_STOCK";
      throw error;
    }
    db.prepare(
      `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = excluded.quantity`,
    ).run(cartId, productId, quantity);
  }
  releaseHolds(cartId);
  db.prepare("UPDATE carts SET updated_at = ? WHERE id = ?").run(nowIso(), cartId);
  return getCart(cartId);
}

function quoteProducts(channel, rawItems) {
  if (channel !== "human" && channel !== "agent") fail(400, "VALIDATION", "渠道只能是 human 或 agent");
  if (!Array.isArray(rawItems) || rawItems.length === 0) fail(400, "VALIDATION", "需要至少一件商品");
  const lines = rawItems.map((item) => {
    const product = findProduct(item?.product_id);
    if (!product) fail(404, "PRODUCT_NOT_FOUND", "没有这个商品");
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) fail(400, "VALIDATION", "数量必须是正整数");
    const stock = availability(product, heldQty(product.id), soldQty(product.id));
    return {
      product_id: product.id,
      name: product.name,
      quantity,
      unit_price: product.price,
      available: stock.available,
      sellable: stock.sellable,
    };
  });
  const priced = priceOrder(lines, channel);
  priced.queried_at = new Date().toISOString();
  priced.offers = offerForLines(lines);
  priced.items = priced.items.map((line, index) => ({
    ...line,
    available: lines[index].available,
    sellable: lines[index].sellable,
  }));
  return priced;
}

function activeHolds(cartId) {
  return db
    .prepare(
      `SELECT * FROM reservations
       WHERE cart_id = ? AND status = 'held' AND expires_at > ?
       ORDER BY product_id`,
    )
    .all(cartId, nowIso());
}

function holdsMatch(cart, holds) {
  if (holds.length !== cart.items.length) return false;
  const quantities = new Map(holds.map((hold) => [hold.product_id, hold.quantity]));
  return cart.items.every((item) => quantities.get(item.product_id) === item.quantity);
}

function insertOrder(cartId, channel, priced, closeCart) {
  const orderId = newId("order");
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO orders (id, cart_id, channel, subtotal, discount, shipping_fee, total, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(orderId, cartId, channel, priced.subtotal, priced.discount, priced.shipping_fee, priced.total, createdAt);
  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const item of priced.items) {
    insertItem.run(orderId, item.product_id, item.name, item.quantity, item.unit_price);
  }
  if (closeCart) {
    db.prepare("UPDATE carts SET status = 'ordered', updated_at = ? WHERE id = ?").run(createdAt, cartId);
  } else {
    const remove = db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?");
    for (const item of priced.items) remove.run(cartId, item.product_id);
    db.prepare("UPDATE carts SET updated_at = ? WHERE id = ?").run(createdAt, cartId);
  }
  return orderId;
}

function chosenItems(cart, productIds) {
  if (!Array.isArray(productIds)) return cart.items;
  const wanted = [...new Set(productIds.filter((id) => typeof id === "string" && id))];
  if (!wanted.length) fail(400, "VALIDATION", "请选择要结账的商品");
  const items = cart.items.filter((item) => wanted.includes(item.product_id));
  if (items.length !== wanted.length) fail(400, "VALIDATION", "有的商品不在购物车里");
  return items;
}

function checkout(cartId, channel, productIds) {
  const cartRow = getCartRow(cartId);
  if (!cartRow) fail(404, "CART_NOT_FOUND", "购物车不存在");
  if (cartRow.status === "ordered") {
    const existing = db.prepare("SELECT id FROM orders WHERE cart_id = ? ORDER BY created_at DESC").get(cartId);
    if (existing) return orderPayload(existing.id);
  }

  const cart = getCart(cartId);
  if (!cart.items.length) fail(400, "VALIDATION", "购物车是空的");
  const items = chosenItems(cart, productIds);
  const full = items.length === cart.items.length;
  const holds = activeHolds(cartId);
  const locked = full && holds.length && holdsMatch(cart, holds) ? JSON.parse(holds[0].quote_snapshot) : null;
  if (holds.length && !locked) releaseHolds(cartId);
  const fresh = getCart(cartId);
  const selling = full ? fresh.items : fresh.items.filter((item) => items.some((chosen) => chosen.product_id === item.product_id));
  if (!locked) {
    const blocked = selling.filter((item) => item.missing || !item.sellable || item.quantity > item.available);
    if (blocked.length) fail(409, "OUT_OF_STOCK", `${blocked.map((item) => item.name).join("、")} 现在不能购买`);
  }
  const stored = cartRow.channel === "agent" ? "agent" : "human";
  const requested = channel === "agent" || channel === "human" ? channel : stored;
  const priced = locked || priceOrder(selling, requested);

  db.exec("BEGIN");
  try {
    const orderId = insertOrder(cartId, locked ? locked.channel : requested, priced, full);
    if (locked) {
      db.prepare("UPDATE reservations SET status = 'consumed' WHERE cart_id = ? AND status = 'held'").run(cartId);
    }
    db.exec("COMMIT");
    return orderPayload(orderId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function createHandoff(cartId, channel = "human") {
  const cart = getCart(cartId);
  if (!cart) fail(404, "CART_NOT_FOUND", "购物车不存在");
  if (cart.status !== "open") fail(409, "VALIDATION", "这个购物车已经结账");
  if (!cart.items.length) fail(400, "VALIDATION", "购物车是空的");
  const shortages = cart.items.filter((item) => {
    if (item.missing) return true;
    const product = findProduct(item.product_id);
    const stock = availability(product, heldQtyExceptCart(product.id, cartId), soldQty(product.id));
    return !stock.sellable || item.quantity > stock.available;
  });
  if (shortages.length) {
    fail(409, "OUT_OF_STOCK", `${shortages.map((item) => item.name).join("、")} 现在不能购买`);
  }

  const priced = priceOrder(cart.items, channel === "human" ? "human" : "agent");
  const snapshot = JSON.stringify(priced);
  const reservedAt = nowIso();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const token = getCartRow(cartId).handoff_token || crypto.randomBytes(16).toString("hex");
  db.exec("BEGIN");
  try {
    releaseHolds(cartId);
    const insert = db.prepare(
      `INSERT INTO reservations
        (id, cart_id, product_id, quantity, reserved_at, expires_at, status, quote_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, 'held', ?)`,
    );
    for (const item of cart.items) {
      insert.run(newId("hold"), cartId, item.product_id, item.quantity, reservedAt, expiresAt, snapshot);
    }
    db.prepare("UPDATE carts SET handoff_token = ?, updated_at = ? WHERE id = ?").run(token, reservedAt, cartId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    token,
    url: `/checkout/${token}`,
    expires_at: expiresAt,
    quote: priced,
  };
}

function getHandoff(token) {
  const cart = db.prepare("SELECT * FROM carts WHERE handoff_token = ?").get(token);
  if (!cart) return null;
  const order = cart.status === "ordered"
    ? db.prepare("SELECT id FROM orders WHERE cart_id = ? ORDER BY created_at DESC").get(cart.id)
    : null;
  if (order) {
    return { token, cart_id: cart.id, channel: cart.channel, ordered: true, order: orderPayload(order.id) };
  }
  releaseExpiredHolds(cart.id);
  const holds = activeHolds(cart.id);
  const current = getCart(cart.id);
  if (!current.items.length) {
    return {
      token,
      cart_id: cart.id,
      channel: cart.channel,
      ordered: false,
      expired: true,
      quote: null,
      shortages: [],
    };
  }
  if (holds.length && holdsMatch(current, holds)) {
    return {
      token,
      cart_id: cart.id,
      channel: cart.channel,
      ordered: false,
      expired: false,
      expires_at: holds[0].expires_at,
      quote: JSON.parse(holds[0].quote_snapshot),
      shortages: [],
    };
  }
  const quote = priceOrder(current.items, current.channel);
  const shortages = current.items
    .filter((item) => item.missing || !item.sellable || item.quantity > item.available)
    .map((item) => ({
      product_id: item.product_id,
      name: item.name,
      requested: item.quantity,
      available: item.available,
    }));
  return {
    token,
    cart_id: cart.id,
    channel: cart.channel,
    ordered: false,
    expired: true,
    quote,
    shortages,
  };
}

function releaseExpiredHolds(cartId) {
  db.prepare(
    `UPDATE reservations SET status = 'released'
     WHERE cart_id = ? AND status = 'held' AND expires_at <= ?`,
  ).run(cartId, nowIso());
}

function orderPayload(orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return null;
  const items = db
    .prepare("SELECT product_id, name, quantity, unit_price FROM order_items WHERE order_id = ? ORDER BY product_id")
    .all(orderId);
  return {
    id: order.id,
    cart_id: order.cart_id,
    channel: order.channel,
    subtotal: order.subtotal,
    discount: order.discount,
    shipping_fee: order.shipping_fee,
    total: order.total,
    items,
    created_at: order.created_at,
  };
}

module.exports = {
  createCart,
  getCart,
  getCartRow,
  setItem,
  quoteProducts,
  createHandoff,
  getHandoff,
  checkout,
  orderPayload,
  setCartChannel,
};

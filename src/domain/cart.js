const crypto = require("crypto");
const { db } = require("../db");
const { findProduct, availability } = require("./catalog");

function nowIso() {
  return new Date().toISOString();
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
    const stock = availability(product, heldQty(product.id));
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
  return {
    id: cart.id,
    channel: cart.channel,
    status: cart.status,
    count,
    sticker_total: stickerTotal,
    items,
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
    const stock = availability(product, heldQty(product.id));
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
  db.prepare("UPDATE carts SET updated_at = ? WHERE id = ?").run(nowIso(), cartId);
  return getCart(cartId);
}

function checkout(cartId) {
  const existing = db.prepare("SELECT * FROM orders WHERE cart_id = ?").get(cartId);
  if (existing) return orderPayload(existing.id);

  const cart = getCart(cartId);
  if (!cart) {
    const error = new Error("购物车不存在");
    error.status = 404;
    error.code = "CART_NOT_FOUND";
    throw error;
  }
  if (!cart.items.length) {
    const error = new Error("购物车是空的");
    error.status = 400;
    error.code = "VALIDATION";
    throw error;
  }
  const blocked = cart.items.filter((item) => item.missing || !item.sellable || item.quantity > item.available);
  if (blocked.length) {
    const error = new Error(`${blocked.map((item) => item.name).join("、")} 现在不能购买`);
    error.status = 409;
    error.code = "OUT_OF_STOCK";
    throw error;
  }

  const orderId = newId("order");
  const createdAt = nowIso();
  const subtotal = cart.sticker_total;
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO orders (id, cart_id, channel, subtotal, discount, shipping_fee, total, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    ).run(orderId, cartId, cart.channel, subtotal, subtotal, createdAt);
    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const item of cart.items) {
      insertItem.run(orderId, item.product_id, item.name, item.quantity, item.unit_price);
    }
    db.prepare("UPDATE carts SET status = 'ordered', updated_at = ? WHERE id = ?").run(createdAt, cartId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return orderPayload(orderId);
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

module.exports = { createCart, getCart, getCartRow, setItem, checkout, orderPayload };

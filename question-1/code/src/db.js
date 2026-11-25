const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dir = path.join(__dirname, "../data");
const file = path.join(dir, "shop.sqlite");
fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL CHECK (channel IN ('human', 'agent')),
    status TEXT NOT NULL CHECK (status IN ('open', 'ordered')),
    handoff_token TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    cart_id TEXT NOT NULL REFERENCES carts(id),
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (cart_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL REFERENCES carts(id),
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reserved_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('held', 'consumed', 'released')),
    quote_snapshot TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL REFERENCES carts(id),
    channel TEXT NOT NULL CHECK (channel IN ('human', 'agent')),
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL,
    shipping_fee INTEGER NOT NULL,
    total INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS catalog_layers (
    category TEXT PRIMARY KEY,
    l0 TEXT NOT NULL,
    l1 TEXT NOT NULL,
    l2 TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS catalog_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL,
    recommendation_score REAL NOT NULL,
    rating_avg REAL,
    review_count INTEGER NOT NULL,
    description TEXT NOT NULL,
    specs TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    PRIMARY KEY (order_id, product_id)
  );
`);

const ordersSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'orders'").get()?.sql || "";
if (/cart_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(ordersSql)) {
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    BEGIN;
    CREATE TABLE orders_next (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL REFERENCES carts(id),
      channel TEXT NOT NULL CHECK (channel IN ('human', 'agent')),
      subtotal INTEGER NOT NULL,
      discount INTEGER NOT NULL,
      shipping_fee INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO orders_next (id, cart_id, channel, subtotal, discount, shipping_fee, total, created_at)
      SELECT id, cart_id, channel, subtotal, discount, shipping_fee, total, created_at FROM orders;
    DROP TABLE orders;
    ALTER TABLE orders_next RENAME TO orders;
    COMMIT;
  `);
  db.exec("PRAGMA foreign_keys = ON");
}

function soldQuantities() {
  const rows = db
    .prepare(
      `SELECT product_id, SUM(quantity) AS qty
       FROM order_items
       GROUP BY product_id`,
    )
    .all();
  const map = new Map();
  for (const row of rows) map.set(row.product_id, Number(row.qty));
  return map;
}

function heldQuantities() {
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT product_id, SUM(quantity) AS qty
       FROM reservations
       WHERE status = 'held' AND expires_at > ?
       GROUP BY product_id`,
    )
    .all(now);
  const map = new Map();
  for (const row of rows) map.set(row.product_id, Number(row.qty));
  return map;
}

function releaseExpired() {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE reservations SET status = 'released' WHERE status = 'held' AND expires_at <= ?`,
  ).run(now);
}

module.exports = { db, heldQuantities, soldQuantities, releaseExpired };

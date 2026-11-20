const assert = require("node:assert/strict");
const test = require("node:test");
const { db } = require("../db");
const { createCart, setItem, checkout } = require("./cart");

test("页内购物车结账是人类价，外部购物车结账是 agent 价", () => {
  const humanCart = createCart("human");
  const agentCart = createCart("agent");
  const ids = [humanCart.id, agentCart.id];
  try {
    setItem(humanCart.id, "P006", 1);
    setItem(agentCart.id, "P006", 1);
    const humanOrder = checkout(humanCart.id);
    const agentOrder = checkout(agentCart.id);
    assert.equal(humanOrder.channel, "human");
    assert.equal(agentOrder.channel, "agent");
    assert.equal(humanOrder.discount, 0);
    assert.equal(humanOrder.total, 490);
    assert.equal(agentOrder.total, 471);
    assert.ok(agentOrder.total < humanOrder.total);
  } finally {
    for (const id of ids) {
      const orders = db.prepare("SELECT id FROM orders WHERE cart_id = ?").all(id);
      for (const order of orders) {
        db.prepare("DELETE FROM order_items WHERE order_id = ?").run(order.id);
        db.prepare("DELETE FROM orders WHERE id = ?").run(order.id);
      }
      db.prepare("DELETE FROM reservations WHERE cart_id = ?").run(id);
      db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(id);
      db.prepare("DELETE FROM carts WHERE id = ?").run(id);
    }
  }
});

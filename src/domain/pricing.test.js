const test = require("node:test");
const assert = require("node:assert/strict");
const { priceOrder } = require("./pricing");

function order(unitPrice, quantity, channel) {
  return priceOrder(
    [{ product_id: "X", name: "样品", quantity, unit_price: unitPrice }],
    channel,
  );
}

test("规格里的三档金额", () => {
  assert.equal(order(990, 1, "human").total, 990);
  assert.equal(order(990, 1, "agent").total, 941);
  assert.equal(order(1000, 1, "human").total, 900);
  assert.equal(order(1000, 1, "agent").total, 855);
  assert.equal(order(1040, 1, "human").total, 940);
  assert.equal(order(1040, 1, "agent").total, 893);
});

test("优惠是折前小计和折后商品金额的差，运费另加", () => {
  const agent = order(1890, 1, "agent");
  assert.deepEqual(
    { subtotal: agent.subtotal, discount: agent.discount, shipping_fee: agent.shipping_fee, total: agent.total },
    { subtotal: 1890, discount: 189, shipping_fee: 0, total: 1701 },
  );
  const small = order(100, 1, "human");
  assert.equal(small.shipping_fee, 100);
  assert.equal(small.discount, 0);
  assert.equal(small.total, 200);
});

test("价格为 0 仍按门槛收运费", () => {
  const human = order(0, 1, "human");
  const agent = order(0, 1, "agent");
  assert.equal(human.total, 100);
  assert.equal(agent.total, 100);
  assert.equal(agent.discount, 0);
});

test("同一组商品，agent 应付不超过 human", () => {
  for (const price of [0, 100, 989, 990, 999, 1000, 1040, 1890]) {
    assert.ok(order(price, 1, "agent").total <= order(price, 1, "human").total);
  }
});

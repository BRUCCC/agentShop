const DISCOUNT_THRESHOLD = 1000;
const DISCOUNT_AMOUNT = 100;
const SHIPPING_THRESHOLD = 990;
const SHIPPING_FEE = 100;

function offerRules() {
  return {
    discount_threshold: DISCOUNT_THRESHOLD,
    discount_amount: DISCOUNT_AMOUNT,
    shipping_threshold: SHIPPING_THRESHOLD,
    shipping_fee: SHIPPING_FEE,
    agent_percent: 95,
  };
}

function offerForLines(lines) {
  const human = priceOrder(lines, "human");
  const agent = priceOrder(lines, "agent");
  return {
    ...offerRules(),
    discount_gap: Math.max(0, DISCOUNT_THRESHOLD - human.subtotal),
    discount_qualified: human.subtotal >= DISCOUNT_THRESHOLD,
    agent_extra: human.total - agent.total,
  };
}

function priceOrder(lines, channel) {
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
  let merchandise = subtotal;
  if (subtotal >= DISCOUNT_THRESHOLD) merchandise -= DISCOUNT_AMOUNT;
  if (channel === "agent") merchandise = Math.round(merchandise * 0.95);
  const shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return {
    channel,
    subtotal,
    discount: subtotal - merchandise,
    shipping_fee: shippingFee,
    total: merchandise + shippingFee,
    items: lines.map((line) => ({
      product_id: line.product_id,
      name: line.name,
      quantity: line.quantity,
      unit_price: line.unit_price,
    })),
  };
}

module.exports = { priceOrder, offerRules, offerForLines };

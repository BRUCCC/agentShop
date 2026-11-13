function priceOrder(lines, channel) {
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0);
  let merchandise = subtotal;
  if (subtotal >= 1000) merchandise -= 100;
  if (channel === "agent") merchandise = Math.round(merchandise * 0.95);
  const shippingFee = subtotal >= 990 ? 0 : 100;
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

module.exports = { priceOrder };

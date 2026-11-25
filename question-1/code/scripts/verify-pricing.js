const base = process.env.SHOP_URL || "http://127.0.0.1:3000";

const cases = [
  { channel: "human", product_id: "P006", subtotal: 390, discount: 0, shipping_fee: 100, total: 490 },
  { channel: "agent", product_id: "P006", subtotal: 390, discount: 19, shipping_fee: 100, total: 471 },
  { channel: "human", product_id: "P017", subtotal: 990, discount: 0, shipping_fee: 0, total: 990 },
  { channel: "agent", product_id: "P017", subtotal: 990, discount: 49, shipping_fee: 0, total: 941 },
  { channel: "human", product_id: "P001", subtotal: 1890, discount: 100, shipping_fee: 0, total: 1790 },
  { channel: "agent", product_id: "P001", subtotal: 1890, discount: 189, shipping_fee: 0, total: 1701 },
  { channel: "human", product_id: "P010", subtotal: 0, discount: 0, shipping_fee: 100, total: 100 },
  { channel: "agent", product_id: "P010", subtotal: 0, discount: 0, shipping_fee: 100, total: 100 },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady() {
  const deadline = Date.now() + 60000;
  let lastError = "没有响应";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/products/P006`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(500);
  }
  throw new Error(`商店没有在 60 秒内启动：${lastError}`);
}

async function quote(channel, productId) {
  const response = await fetch(`${base}/api/quotes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel, items: [{ product_id: productId, quantity: 1 }] }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${channel} ${productId} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  await waitUntilReady();
  const failures = [];
  for (const item of cases) {
    const body = await quote(item.channel, item.product_id);
    const fields = ["subtotal", "discount", "shipping_fee", "total"];
    const mismatch = fields.filter((field) => body[field] !== item[field]);
    if (mismatch.length) {
      failures.push(`${item.channel} ${item.product_id} ${mismatch.join(",")} 得到 ${JSON.stringify(body)}`);
      continue;
    }
    console.log(`${item.channel} ${item.product_id} 应付 ${body.total}`);
  }
  if (failures.length) {
    throw new Error(failures.join("\n"));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

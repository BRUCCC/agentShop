const { searchProducts, findProduct, detailItem } = require("./domain/catalog");
const { heldQuantities, soldQuantities } = require("./db");
const {
  getCartRow,
  createCart,
  setItem,
  quoteProducts,
  createHandoff,
  checkout,
} = require("./domain/cart");

const MAX_ROUNDS = 6;
const ORDER_INTENT = /下单|下單|结账|結帳|结帐|付款|支付|买单|買單|提交订单|确认下单|確認下單|完成订单|完成下单|帮我下单|直接下单|现在下单|去结账|去付款|模拟付款|我要买下|帮我买下/;

const SYSTEM_PROMPT = `你是 Agent-Ready 商店的店员，用简体中文回复。
价格、库存、规格和评论只能来自工具结果，不能自己编。
搜索默认交给工具，不要一次索取全部商品。
P001 和 P002 都叫 Aero 无线蓝牙耳机，只能用商品 id 区分，不能互相替换。
update_cart 只改购物车，不能下单，也不能当作已经付款。
用户只说加入购物车、想看某件商品或询问价格时，禁止调用 place_order。
只有用户这句明确要下单、结账或付款时，才能调用 place_order。
create_handoff 只锁库存并给出确认链接，不下单。
回复里写清商品 id 和工具返回的金额。不要复述 API key。`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "按名称搜索商品。默认 8 笔，最多 20 笔。",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string" },
          brand: { type: "string" },
          category: { type: "string" },
          in_stock: { type: "boolean" },
          limit: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description: "按商品 id 查看规格、库存和全部评论。",
      parameters: {
        type: "object",
        properties: { product_id: { type: "string" } },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quote",
      description: "按商品 id 和数量报价，不锁库存，不改购物车。",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["human", "agent"] },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                quantity: { type: "integer" },
              },
              required: ["product_id", "quantity"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_cart",
      description: "更新 agent 购物车。quantity 大于 0 是设置数量，0 是删除。不会下单。",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          quantity: { type: "integer" },
        },
        required: ["product_id", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_handoff",
      description: "为当前 agent 购物车锁库存 24 小时，返回确认页链接。不下单。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "place_order",
      description: "结算当前 agent 购物车。仅当用户这句明确要求下单时调用。",
      parameters: { type: "object", properties: {} },
    },
  },
];

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function quantityLookup(load) {
  const map = load();
  return (productId) => map.get(productId) || 0;
}

function endpointFor(apiBase) {
  let url;
  try {
    url = new URL(apiBase);
  } catch {
    fail(400, "VALIDATION", "API 地址不正确");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    fail(400, "VALIDATION", "API 地址必须是 http 或 https");
  }
  const trimmed = apiBase.replace(/\/$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function latestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user" && typeof messages[index].content === "string") {
      return messages[index].content;
    }
  }
  return "";
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    fail(400, "VALIDATION", "需要 1 到 40 条对话");
  }
  return messages.map((message) => {
    if (!message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
      fail(400, "VALIDATION", "对话只接受用户和助手的文本");
    }
    if (message.content.length > 4000) fail(400, "VALIDATION", "单条对话过长");
    return { role: message.role, content: message.content };
  });
}

function parseArgs(call) {
  try {
    return JSON.parse(call.function.arguments || "{}");
  } catch {
    return {};
  }
}

function toolError(error) {
  return {
    error: {
      code: error.code || "VALIDATION",
      message: error.message || "这个操作没有完成",
    },
  };
}

function ensureAgentCart(state) {
  const row = state.cartId ? getCartRow(state.cartId) : null;
  if (!row || row.channel !== "agent" || row.status !== "open") {
    state.cartId = createCart("agent").id;
  }
  return state.cartId;
}

function runTool(name, args, state, userText) {
  if (name === "search_products") {
    const limit = Number(args.limit);
    return searchProducts({
      q: args.q,
      brand: args.brand,
      category: args.category,
      inStock: args.in_stock === true,
      limit: Number.isInteger(limit) ? Math.min(20, Math.max(1, limit)) : 8,
      offset: 0,
      held: quantityLookup(heldQuantities),
      sold: quantityLookup(soldQuantities),
    });
  }
  if (name === "get_product") {
    const product = findProduct(args.product_id);
    if (!product) return toolError({ code: "PRODUCT_NOT_FOUND", message: "没有这个商品" });
    const held = quantityLookup(heldQuantities);
    const sold = quantityLookup(soldQuantities);
    return detailItem(product, held(product.id), sold(product.id));
  }
  if (name === "quote") {
    try {
      return quoteProducts(args.channel || "agent", args.items);
    } catch (error) {
      return toolError(error);
    }
  }
  if (name === "update_cart") {
    const quantity = Number(args.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return toolError({ code: "VALIDATION", message: "数量必须是非负整数" });
    }
    try {
      const cart = setItem(ensureAgentCart(state), args.product_id, quantity);
      state.changed = true;
      return cart;
    } catch (error) {
      return toolError(error);
    }
  }
  if (name === "create_handoff") {
    try {
      const handoff = createHandoff(ensureAgentCart(state));
      state.changed = true;
      return handoff;
    } catch (error) {
      return toolError(error);
    }
  }
  if (name === "place_order") {
    if (!ORDER_INTENT.test(userText)) {
      return toolError({ code: "VALIDATION", message: "用户没有明确要求下单，不能下单" });
    }
    try {
      const order = checkout(ensureAgentCart(state));
      state.changed = true;
      state.cartId = null;
      return order;
    } catch (error) {
      return toolError(error);
    }
  }
  return toolError({ code: "VALIDATION", message: "没有这个工具" });
}

async function callModel({ url, apiKey, model, messages }) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: "auto" }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    fail(502, "MODEL_UNAVAILABLE", "模型暂时没有响应");
  }
  if (!response.ok) fail(502, "MODEL_UNAVAILABLE", "模型没有接受这次请求");
  const payload = await response.json().catch(() => null);
  const message = payload?.choices?.[0]?.message;
  if (!message) fail(502, "MODEL_UNAVAILABLE", "模型没有返回内容");
  return message;
}

function hideKey(text, apiKey) {
  if (!apiKey || !text.includes(apiKey)) return text;
  return text.split(apiKey).join("［已隐藏］");
}

async function chat({ apiBase, apiKey, model, cartId, messages }) {
  if (!apiKey || !String(apiKey).trim()) fail(400, "MODEL_UNAVAILABLE", "没有填写 API key，不能调用模型");
  if (!model || !String(model).trim()) fail(400, "VALIDATION", "需要填写模型名称");
  const url = endpointFor(apiBase);
  const userText = latestUserText(messages);
  const state = { cartId: cartId || null, changed: false };
  const transcript = [{ role: "system", content: SYSTEM_PROMPT }, ...normalizeMessages(messages)];

  let reply = "";
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const message = await callModel({ url, apiKey: String(apiKey), model: String(model).trim(), messages: transcript });
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      reply = typeof message.content === "string" ? message.content : "";
      break;
    }
    transcript.push({
      role: "assistant",
      content: message.content || "",
      tool_calls: calls,
    });
    for (const call of calls) {
      const result = runTool(call.function?.name, parseArgs(call), state, userText);
      transcript.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
    if (typeof message.content === "string" && message.content.trim()) reply = message.content;
  }

  if (!reply) reply = "这一步没有完成，请换个说法再试一次。";
  return {
    reply: hideKey(reply, String(apiKey)),
    cart_id: state.cartId,
    changed: state.changed,
  };
}

module.exports = { chat, ORDER_INTENT };

const { searchProducts, findProduct, detailItem } = require("./domain/catalog");
const { recommendProducts } = require("./domain/rag");
const { heldQuantities, soldQuantities } = require("./db");
const {
  getCartRow,
  createCart,
  setItem,
  quoteProducts,
  createHandoff,
  checkout,
} = require("./domain/cart");
const { loadToolSkills, toolDefinitions, systemPrompt, orderPhrases } = require("./skills");

const MAX_ROUNDS = 6;
const skills = loadToolSkills();
const TOOLS = toolDefinitions(skills);
const SYSTEM_PROMPT = systemPrompt(skills);
const ORDER_PHRASES = orderPhrases(skills);

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

function wantsOrder(text) {
  return ORDER_PHRASES.some((phrase) => text.includes(phrase));
}

function ensureOpenCart(state) {
  const row = state.cartId ? getCartRow(state.cartId) : null;
  if (!row || row.status !== "open") state.cartId = createCart("human").id;
  return state.cartId;
}

function runTool(name, args, state, userText) {
  if (name === "recommend") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return toolError({ code: "VALIDATION", message: "需要顾客的需求" });
    return recommendProducts(query, quantityLookup(heldQuantities), quantityLookup(soldQuantities));
  }
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
      const cart = setItem(ensureOpenCart(state), args.product_id, quantity);
      state.changed = true;
      return cart;
    } catch (error) {
      return toolError(error);
    }
  }
  if (name === "create_handoff") {
    try {
      const handoff = createHandoff(ensureOpenCart(state), "agent");
      state.changed = true;
      return handoff;
    } catch (error) {
      return toolError(error);
    }
  }
  if (name === "place_order") {
    if (!wantsOrder(userText)) {
      return toolError({ code: "VALIDATION", message: "用户没有明确要求下单，不能下单" });
    }
    try {
      const order = checkout(ensureOpenCart(state), "agent");
      state.changed = true;
      state.ordered = true;
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
  return { message, usage: usageFrom(payload) };
}

function usageFrom(payload) {
  const usage = payload?.usage;
  if (!usage) return null;
  const prompt = Number(usage.prompt_tokens);
  const completion = Number(usage.completion_tokens);
  const total = Number(usage.total_tokens);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion) || !Number.isFinite(total)) return null;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
}

function emptyUsage() {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, rounds: 0, missing: 0 };
}

function addUsage(sum, usage) {
  if (!usage) {
    sum.missing += 1;
    return;
  }
  sum.prompt_tokens += usage.prompt_tokens;
  sum.completion_tokens += usage.completion_tokens;
  sum.total_tokens += usage.total_tokens;
  sum.rounds += 1;
}

function usageSummary(sum) {
  const calls = sum.rounds + sum.missing;
  const lines = ["Token 报告", `这次任务调用模型 ${calls} 次。`];
  if (sum.rounds === 0) {
    lines.push("模型没有返回用量，这次任务无法合计。");
  } else {
    lines.push(`输入 ${sum.prompt_tokens} token，输出 ${sum.completion_tokens} token，合计 ${sum.total_tokens} token。`);
    lines.push("合计是这一次任务里各次模型调用相加。");
  }
  if (sum.missing > 0 && sum.rounds > 0) lines.push(`${sum.missing} 次调用没有返回用量，没有计入合计。`);
  return {
    prompt_tokens: sum.prompt_tokens,
    completion_tokens: sum.completion_tokens,
    total_tokens: sum.total_tokens,
    calls,
    reported_calls: sum.rounds,
    report: lines.join("\n"),
  };
}

function hideKey(text, apiKey) {
  if (!apiKey || !text.includes(apiKey)) return text;
  return text.split(apiKey).join("［已隐藏］");
}

async function chat({ apiKey, apiBase, model, cartId, messages }) {
  if (!apiKey || !String(apiKey).trim()) fail(400, "MODEL_UNAVAILABLE", "没有填写 API key，不能调用模型");
  if (!apiBase || !String(apiBase).trim() || !model || !String(model).trim()) {
    fail(400, "MODEL_UNAVAILABLE", "没有填写模型地址或模型名称");
  }
  const url = endpointFor(String(apiBase).trim());
  const userText = latestUserText(messages);
  const state = { cartId: cartId || null, changed: false, ordered: false };
  const transcript = [{ role: "system", content: SYSTEM_PROMPT }, ...normalizeMessages(messages)];
  const spent = emptyUsage();

  let reply = "";
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let called;
    try {
      called = await callModel({ url, apiKey: String(apiKey), model: String(model).trim(), messages: transcript });
    } catch (error) {
      error.usage = usageSummary(spent);
      throw error;
    }
    addUsage(spent, called.usage);
    const message = called.message;
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
    cart_id: state.ordered ? null : state.cartId,
    changed: state.changed,
    ordered: state.ordered,
    usage: usageSummary(spent),
  };
}

module.exports = { chat, wantsOrder };

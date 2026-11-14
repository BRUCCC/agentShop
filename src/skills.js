const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "../skills");
const toolOrder = ["search_products", "get_product", "quote", "update_cart", "create_handoff", "place_order"];

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return { fields, body: match[2].trim() };
}

function parametersFrom(body) {
  const match = body.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!match) return { type: "object", properties: {} };
  return JSON.parse(match[1]);
}

function phrasesFrom(body) {
  const match = body.match(/## 下单用语\r?\n([\s\S]*?)(\r?\n## |$)/);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^- (.+)$/))
    .filter(Boolean)
    .map((item) => item[1].trim())
    .filter(Boolean);
}

function loadToolSkills() {
  const skills = fs
    .readdirSync(root)
    .filter((name) => name.startsWith("shop-"))
    .map((name) => {
      const file = path.join(root, name, "SKILL.md");
      if (!fs.existsSync(file)) return null;
      const parsed = parseFrontmatter(fs.readFileSync(file, "utf8"));
      if (!parsed?.fields.tool) return null;
      return {
        tool: parsed.fields.tool,
        description: parsed.fields.description,
        body: parsed.body,
        parameters: parametersFrom(parsed.body),
        phrases: phrasesFrom(parsed.body),
      };
    })
    .filter(Boolean);
  skills.sort((a, b) => toolOrder.indexOf(a.tool) - toolOrder.indexOf(b.tool));
  return skills;
}

function toolDefinitions(skills) {
  return skills.map((skill) => ({
    type: "function",
    function: {
      name: skill.tool,
      description: skill.description,
      parameters: skill.parameters,
    },
  }));
}

function systemPrompt(skills) {
  const rules = skills.map((skill) => skill.body.replace(/```json[\s\S]*?```/g, "").trim()).join("\n\n");
  return `你是 Agent-Ready 商店的店员，用简体中文回复。人和对话栏使用同一辆购物车。价格、库存、规格和评论只能来自工具结果。不要复述 API key。\n\n${rules}`;
}

function orderPhrases(skills) {
  return skills.find((skill) => skill.tool === "place_order")?.phrases || [];
}

module.exports = { loadToolSkills, toolDefinitions, systemPrompt, orderPhrases };

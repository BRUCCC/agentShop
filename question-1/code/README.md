# Agent-Ready 商店

给人用的商品站，也给外部 AI agent 用。价格只在 `src/domain/pricing.js` 计算一份。网页、页内对话和外部接口都用这一份。

没有线上地址。本机一条命令启动。

## 启动

```bash
npm install
npm start
```

浏览器打开 http://localhost:3000 。`npm run dev` 和 `npm start` 是同一条命令。

对话栏顶部填写 API key。模型地址和模型名称默认是 `https://api.deepseek.com` 和 `deepseek-chat`。密钥不要写进仓库。

## 测试

```bash
npm test
```

推送到 GitHub 后，仓库根目录的 `.github/workflows/test.yml` 会在本目录安装依赖、跑上面的测试，再执行 `npm start`。服务起来之后，`scripts/verify-pricing.js` 向报价接口核对人类价和 AI 价。数据库在运行时生成，不提交。

手工用例在 `docs/test-cases.md`。

## Agent 怎么连

两种方式，价格规则相同。普通打开网页是人类订单，没有 95 折。

| 方式 | 入口 | 谁算 AI 下单 |
| --- | --- | --- |
| 有文档的 JSON API | `docs/external-agent-api.md`，基地址 `http://localhost:3000` | `POST /api/carts` 时 `channel` 为 `agent`。调用方自己保存 `cart_id`，不使用浏览器 cookie |
| 本机打开页面 | http://localhost:3000/?as=agent | 浏览器写入 AI 下单标识。这辆车的报价、确认页和页内对话按 95 折。打开 `/?as=human` 恢复人类价 |

不建 MCP。加购和下单只认商品 id。P001 和 P002 同名，不能互换。

## 缴交文件

| 要求 | 文件 |
| --- | --- |
| 启动、测试、agent 怎么连 | 本文件 |
| 调整过、照做或有疑问的需求 | `DECISIONS.md`，v0.2 的判断在 `DECISIONS_V2.md` |
| 给 agent 的 context、实现前的规格和任务 | `AGENTS.md`、`SPEC.md`、`PLAN.md`、`TASKS.md` |
| 协作过程、失败和修正 | `AI_WORKFLOW.md`。过程素材在 `AI_NOTES.md` |
| 价格只有一份，Actions 会跑 | `src/domain/pricing.js`、仓库根目录的 `.github/workflows/test.yml` |
| 真实 agent 购物纪录 | `AGENT_SHOPPING_LOG.md` |
| 未经编辑的原始 session | `RAW_SESSION.md` |

方案和接口细节在 `技术方案.md`、`技术方案_v2.md`、`前端技术方案.md`、`后端技术方案.md`、`agent技术方案.md`。

## 还要补上

- 仓库保持私人，邀请题目邮件里的账号，并回复该邮件附上链接。提交历史不要 squash。

# Agent-Ready 商店

给人用的商品站。商城页面右侧有一条可以打字购物的对话栏。价格只在服务端算一份。网页版式参考 [汪喵星球 · 最新商品](https://www.dogcatstar.com/hk/product-category/new/)，该站没有的功能不做。

商品列表、商品页、购物车、确认页和右侧对话栏可以在本地跑。列表和购物车显示标价。确认页和对话报价使用服务端的同一份价格计算。

## 现在看这些

| 文件 | 内容 |
| --- | --- |
| `技术方案.md` | 总方案和风险 |
| `agent技术方案.md` | 右侧对话栏、报价和交接 |
| `前端技术方案.md` | 页面、布局、对话栏 |
| `后端技术方案.md` | 数据库设计和接口 |
| `SPEC.md` | 产品行为 |
| `PLAN.md` | 开工门禁和实现顺序 |
| `DECISIONS.md` | 对 PM 需求的取舍 |
| `TASKS.md` | 任务 |
| `AGENTS.md` | 给 coding agent 的约束 |

## 启动

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:3000 。搜索、加入购物车和模拟付款都会在写入后重新加载页面，再向商品接口读取标价。

## 测试

```bash
npm test
```

这条命令检查同一份价格计算，以及渠道、检索和推荐。推送到 GitHub 后，`.github/workflows/test.yml` 会先跑这条测试，再执行 `npm start`。服务起来之后，`scripts/verify-pricing.js` 向报价接口核对人类价和 AI 价。测试用到的数据库在运行时生成，不需要提交。

对话栏填写 API key。模型地址和模型名称已经填在旁边的输入框里，默认是 `https://api.deepseek.com` 和 `deepseek-chat`。密钥不要写进仓库。

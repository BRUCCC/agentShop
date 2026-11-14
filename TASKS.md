# TASKS

> 草稿。实现前拆任务。做完把 `[ ]` 改成 `[x]`，不要在这里写实现细节。
> 顺序见 `PLAN.md`。技术方案没经过需求澄清、也没明确可以开工之前，不做下面的网页、接口和右侧对话栏。

## 开工前

- [x] 写出 `技术方案.md`，给人看
- [x] 你重新做一次需求澄清，并改 `SPEC.md`、`DECISIONS.md`
- [x] 澄清结果同步到 `技术方案.md`、`PLAN.md`、`TASKS.md`、`AGENTS.md`
- [x] 你明确说可以写代码

## 定稿

- [ ] 填完 `DECISIONS.md` 里要保留的条目
- [ ] 填完 `SPEC.md`
- [ ] 填完 `PLAN.md`
- [ ] 填完 `AGENTS.md` 里还空着的约束

## 价格

- [x] 一份价格计算，网页和 agent 接口共用
- [x] 测试覆盖这份实现
- [x] GitHub Actions 跑这些测试

## 给人用的网页

版式参考汪喵星球最新商品页。该站没有的功能不做。

- [x] 商品列表
- [x] 商品页
- [x] 购物车
- [x] 模拟结账

## 给 agent 用的接口

用 JSON 接口加 skill，不建 MCP。

- [x] 商品读接口，标价来自 `data/products.json`
- [x] 搜索商品
- [x] 查询规格和库存
- [x] 报价
- [x] 更新购物车
- [x] 交接链接，预留带 `reserved_at` 和 `expires_at`
- [x] `skills/shop-assistant/SKILL.md` 写清调用方式：可以下单，但加入购物车本身不下单

## 右侧对话栏

- [x] 商城页面右侧的侧边栏。顶部输入 API 和 API key。可以改购物车，也可以在用户明确要求时下单。不另做页面。

## 提交材料

- [ ] `README.md` 写清启动和测试
- [ ] `skills/shared-pricing/SKILL.md` 写完，并记下用了几次、改过几版
- [ ] `docs/agent-shopping-log.md` 放上真实购物记录，或在 README 指向录像
- [ ] `AI_NOTES.md` 写成 3 到 5 则
- [ ] 提交历史保持完整，不 squash
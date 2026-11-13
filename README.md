# Agent-Ready 商店

给人用的商品站。商城页面右侧有一条可以打字购物的对话栏。价格只在服务端算一份。网页版式参考 [汪喵星球 · 最新商品](https://www.dogcatstar.com/hk/product-category/new/)，该站没有的功能不做。

商品列表、商品页、购物车和确认页已经可以在本地跑。这一阶段只显示标价，对话栏和优惠还没有接入。

## 现在看这些

| 文件 | 内容 |
| --- | --- |
| `技术方案.md` | 总方案和风险 |
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

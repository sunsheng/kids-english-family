# 开发进度

更新时间：2026-07-01

## 已完成

- 搭建 Docker PostgreSQL 开发环境。
- 落地 `docs/database-schema.md` 中的初始数据库 schema。
- 搭建 Next.js + TypeScript 前端框架。
- 增加基础工程配置：ESLint、Prettier、EditorConfig。
- 增加 README 和本地开发说明。
- 实现 PC 端应用基础布局：顶部栏、左侧学员列表、左侧功能导航和右侧内容区。
- 实现“仪表盘”页面静态数据：今日任务、复习任务、学习统计和打卡热力图。
- 实现“选词库”页面静态数据：词书网格、学习进度和每日新词量设置弹窗。
- 重做 `design/word-card-mockup.html`，落地学习室键盘流程参照：自动发音、认知卡片、方向键决策和拼写测试三轮布局。

## 当前验证

- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm run build`
- Docker PostgreSQL health check
- 数据库 schema 表数量检查

## 已知事项

- `npm audit --omit=dev` 当前提示 Next.js 依赖链中的 `postcss` moderate 漏洞；npm 给出的自动修复需要破坏性版本变更，暂不执行。

## Phase 1 状态

已完成。

## 下一步

对应 PRD Phase 2 第 1 步：

1. 接入后端 API（Node.js）。
2. 明确 Express/NestJS 后端目录结构。
3. 先实现用户、学员和词书静态读取接口，为前端替换静态数据做准备。

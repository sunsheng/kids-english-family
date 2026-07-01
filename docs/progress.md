# 开发进度

更新时间：2026-07-01

## 已完成

- 搭建 Docker PostgreSQL 开发环境。
- 落地 `docs/database-schema.md` 中的初始数据库 schema。
- 搭建 Next.js + TypeScript 前端框架。
- 增加基础工程配置：ESLint、Prettier、EditorConfig。
- 增加 README 和本地开发说明。

## 当前验证

- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm run build`
- Docker PostgreSQL health check
- 数据库 schema 表数量检查

## 已知事项

- `npm audit --omit=dev` 当前提示 Next.js 依赖链中的 `postcss` moderate 漏洞；npm 给出的自动修复需要破坏性版本变更，暂不执行。

## 下一步

对应 PRD Phase 1 第 2 步：

1. 实现左侧导航栏和顶部栏布局。
2. 保持静态数据，不接入后端 API。
3. 验证 PC 端基础布局和构建通过。

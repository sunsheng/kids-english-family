# 少儿英语·家庭版

面向 PC 网页端的家庭英语词汇学习工具。当前项目处于基础设施搭建阶段。

## 技术栈

- Next.js + TypeScript
- PostgreSQL
- Docker Compose

## 本地开发

安装依赖：

```bash
npm install
```

启动数据库：

```bash
docker compose up -d db
```

启动前端：

```bash
npm run dev
```

访问：

```text
http://localhost:3001
```

Demo 登录：

```text
email: demo@example.com
password: demo123456
```

## 数据库

本地开发数据库通过 Docker Compose 启动，初始化脚本位于 `db/init/001_schema.sql`。

默认连接信息：

```text
host: localhost
port: 5432
database: kids_english_family
user: kids_english
password: kids_english_dev
```

环境变量示例见 `.env.example`。

Phase 2 的开发种子数据包含 demo 家长账号、两名学员、样例词书、样例单词和一条默认学习计划。若数据库卷是在种子数据加入前创建的，需要重建本地开发卷后重新初始化：

```bash
docker compose down -v
docker compose up -d db
```

词库 CSV 校验和导入：

```bash
npm run wordbank:validate
npm run wordbank:import
```

完整词库构建和导入：

```bash
npm run wordbank:build
npm run wordbank:validate:full
npm run wordbank:import:full
```

`wordbank:build` 会把可抓取的 K12 词库源下载到 `.cache/word-bank-sources`，生成去重后的 `data/generated/full-word-bank.csv`。`wordbank:import:full` 使用 `--replace-books` 重建本次 CSV 涉及词书的条目关系，避免重复导入造成脏数据。

CSV 字段和数据源映射见 [docs/word-bank-import.md](docs/word-bank-import.md)。

## 后端 API

当前使用 Next.js API routes 作为 Node.js 后端 API：

- `POST /api/auth/login`
- `GET /api/students?userId=...`
- `POST /api/students`
- `PATCH /api/students/:id`
- `DELETE /api/students/:id`
- `GET /api/word-books?studentId=...`
- `POST /api/study-plans`
- `GET /api/learning/next?studentId=...`
- `POST /api/learning/records`
- `GET /api/words/:word?accent=us|uk`

## 常用命令

```bash
npm run lint
npm run format:check
npm run wordbank:build
npm run wordbank:validate
npm run wordbank:validate:full
npm run typecheck
npm run build
```

## 文档

- 产品需求：[docs/PRD.md](docs/PRD.md)
- 数据库设计：[docs/database-schema.md](docs/database-schema.md)
- 拼写测试设计：[docs/spelling-drill-design.md](docs/spelling-drill-design.md)
- 词库调研：[docs/dictionary-and-wordbank-research.md](docs/dictionary-and-wordbank-research.md)
- 词库导入：[docs/word-bank-import.md](docs/word-bank-import.md)
- 测试方法与验收：[docs/testing-and-acceptance.md](docs/testing-and-acceptance.md)
- 开发进度：[docs/progress.md](docs/progress.md)
- 学习室键盘流程参照：[design/word-card-mockup.html](design/word-card-mockup.html)

## 许可证

项目代码使用 [MIT License](LICENSE)。通过词库脚本导入的第三方词库数据保留各自来源的版权和使用条款，不随项目代码许可证重新授权。

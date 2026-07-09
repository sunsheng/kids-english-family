# 少儿英语·家庭版

面向 PC 网页端的家庭英语词汇学习工具。当前项目处于基础设施搭建阶段。

## 技术栈

- Next.js + TypeScript
- PostgreSQL

## 本地开发

安装依赖：

```bash
npm install
```

启动数据库（本机 PostgreSQL；线上部署使用 Vercel + Neon，见 [docs/deploy-vercel.md](docs/deploy-vercel.md)）：

```bash
sudo apt-get install -y postgresql
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER kids_english WITH PASSWORD 'kids_english_dev';"
sudo -u postgres psql -c "CREATE DATABASE kids_english_family OWNER kids_english;"
sudo -u postgres psql -d kids_english_family -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
PGPASSWORD=kids_english_dev psql -h localhost -U kids_english -d kids_english_family -f db/init/001_schema.sql
PGPASSWORD=kids_english_dev psql -h localhost -U kids_english -d kids_english_family -f db/init/002_settings_and_test_progress.sql
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

本地开发数据库初始化脚本位于 `db/init/`（按序号依次执行：`001_schema.sql` 基础 schema + 种子数据，`002_settings_and_test_progress.sql` 学员教材版本偏好与测试进度表）。

默认连接信息：

```text
host: localhost
port: 5432
database: kids_english_family
user: kids_english
password: kids_english_dev
```

环境变量示例见 `.env.example`。

Phase 2 的开发种子数据包含 demo 家长账号、两名学员、样例词书、样例单词和一条默认学习计划。若本地库是在种子数据加入前初始化的，需要重建数据库后重新执行初始化脚本：

```bash
sudo -u postgres psql -c "DROP DATABASE kids_english_family;"
sudo -u postgres psql -c "CREATE DATABASE kids_english_family OWNER kids_english;"
PGPASSWORD=kids_english_dev psql -h localhost -U kids_english -d kids_english_family -f db/init/001_schema.sql
PGPASSWORD=kids_english_dev psql -h localhost -U kids_english -d kids_english_family -f db/init/002_settings_and_test_progress.sql
```

词库 CSV 校验和导入：

```bash
npm run wordbank:validate
npm run wordbank:import
```

完整词库构建和导入（当前推荐:只用 `lilinji/English` 源,覆盖 19 个教材版本全套 + 中考/高考词表,共 354 本词书、约 2 万词）：

```bash
node scripts/build-full-word-bank.mjs --only=english
npm run wordbank:validate:full
npm run wordbank:import:full
```

聚合全部 6 个数据源则运行 `npm run wordbank:build`。`wordbank:build` 会把可抓取的 K12 词库源下载到 `.cache/word-bank-sources`，生成去重后的 `data/generated/full-word-bank.csv`。`wordbank:import:full` 使用 `--replace-books` 重建本次 CSV 涉及词书的条目关系，避免重复导入造成脏数据。

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
- `GET /api/learning/next?studentId=...`（学习进度游标，按课程顺序取下一个词）
- `POST /api/learning/records`
- `GET /api/learning/reviews?studentId=...`
- `GET /api/testing/next?studentId=...`（测试进度游标，与学习进度隔离，按 学员 x 词书 独立推进）
- `POST /api/testing/records`
- `GET /api/vocabulary?studentId=...`
- `GET /api/dashboard?studentId=...`
- `GET /api/words/:word?accent=us|uk`

## 发音

单词发音使用有道 dictvoice 接口（`https://dict.youdao.com/dictvoice?audio=<word>&type=<1|2>`，`type=1` 英音、`type=2` 美音），国内直连、无需注册、无需 API Key；音标读取本地词库；若词库自带音频 URL 则优先使用。

## 用户设置与词库筛选

- 一个账号对应一名学员：登录后自动加载（首次自动创建）唯一的学习档案，在「设置」页编辑。
- 学习档案可设置：学段（小学/初中/高中）、具体年级、教材版本（人教版/北师大版等 19 个版本）、发音口音。
- 「选词库」默认按上述设置自动筛选出推荐词书，可切换「全部词书」并按学段/版本/关键词继续筛选。
- 学习进度按 词书 保存：切换词书时原计划自动暂停、进度保留，切回后继续学习。
- 拼写测试进度独立于学习进度，同样按 词书（即不同学段/学期/版本）隔离，按"一阶段一阶段"（默认 10 词/阶段）顺序推进。

## 数据库备份

`db/backup/kids_english_family.sql` 是完整逻辑备份（schema + 全量词库数据 + demo 账号），可直接恢复到空库，见 [db/backup/README.md](db/backup/README.md)。使用备份恢复时不要再执行 `db/init/` 初始化脚本，两者取其一。

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
- 部署（Vercel + Neon）：[docs/deploy-vercel.md](docs/deploy-vercel.md)
- 开发进度：[docs/progress.md](docs/progress.md)
- 学习室键盘流程参照：[design/word-card-mockup.html](design/word-card-mockup.html)

## 许可证

项目代码使用 [MIT License](LICENSE)。通过词库脚本导入的第三方词库数据保留各自来源的版权和使用条款，不随项目代码许可证重新授权。

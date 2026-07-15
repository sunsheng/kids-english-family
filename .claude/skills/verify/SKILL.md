---
name: verify
description: 启动本项目（Next.js + PostgreSQL）并用 Playwright 截图验证 UI 改动的完整步骤，含云端容器内无 root PostgreSQL 的搭建方法。
---

# 启动与验证 kids-english-family

## 1. PostgreSQL（云端容器内无现成实例时）

PostgreSQL 二进制在 `/usr/lib/postgresql/16/bin/`，**不能以 root 运行**，需用非特权用户：

```bash
id pguser 2>/dev/null || useradd -m pguser
PGDATA=/tmp/pgdata; PGBIN=/usr/lib/postgresql/16/bin
mkdir -p "$PGDATA" && chown pguser "$PGDATA" && chmod 700 "$PGDATA"
su pguser -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust"
su pguser -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pg.log -o '-p 5432 -k /tmp' start"

export PGHOST=127.0.0.1 PGPORT=5432
psql -U postgres -c "CREATE USER kids_english WITH PASSWORD 'kids_english_dev';"
psql -U postgres -c "CREATE DATABASE kids_english_family OWNER kids_english;"
```

应用连接串默认 `kids_english:kids_english_dev@localhost:5432/kids_english_family`（见 `lib/db.ts`）。

## 2. 数据库 bootstrap 的坑

应用首次查询时自动恢复 `db/backup/kids_english_family.sql`（约 24 万词条，需几分钟）。
**已知坑**：备份是 pg_dump 格式，内含 `set_config('search_path', '', false)`，会把连接池会话的
search_path 置空，导致随后 `db/init/003_test_records.sql` 的非限定 `CREATE TABLE` 报
`3F000 no schema has been selected`。修法——手动补迁移并登记版本，然后**重启 dev server**
（失败的 bootstrapPromise 会被进程缓存）：

```bash
psql -U kids_english -d kids_english_family -f db/init/003_test_records.sql
psql -U kids_english -d kids_english_family -c \
  "INSERT INTO schema_migrations (version) VALUES ('2026_07_09_test_records') ON CONFLICT DO NOTHING;"
```

## 3. 启动应用

```bash
npm install
npm run dev > /tmp/dev.log 2>&1 &   # 端口 3001
# 验活：应返回 200 和 user JSON
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo123456"}' -w "\nHTTP:%{http_code}\n"
```

Demo 账号：`demo@example.com` / `demo123456`（种子数据在 `db/init/001_schema.sql`）。

## 4. Playwright 多分辨率截图

- 用项目已装的 `@playwright/test`（没有独立 `playwright` 包）。
- **脚本必须放在项目根目录内**，否则 node 解析不到 `node_modules`。
- 浏览器用预装路径，别跑 `playwright install`：`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`（目录版本号可能变化，先 `ls /opt/pw-browsers/`）。

```js
// 项目根目录下 xxx.mjs，node xxx.mjs 运行
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'demo@example.com');
await page.fill('input[type="password"]', 'demo123456');
await page.click('button[type="submit"]');
await page.waitForSelector('.topbar', { timeout: 15000 });
await page.screenshot({ path: '/tmp/shot.png' });
await browser.close();
```

关键断点：桌面 >1024px（学员卡在 sidebar）、≤1024px（学员卡移到 topbar、导航横向）、≤720px（手机紧凑样式）。截图后**务必用 Read 工具查看图片**确认布局，别只看选择器断言。

# 部署到 Vercel（GitHub 账号一键部署）

本项目部署形态:**Vercel（应用托管）+ Neon（PostgreSQL 数据库）**,代码托管在 GitHub,push 到 `main` 自动部署。家庭自用规模下全部免费,唯一现实开销是自定义域名(一年几十元,国内访问必需,无需备案)。

## 架构与兼容性

- Next.js App Router,API 路由跑在 Vercel Serverless Functions 上;
- 会话是 HMAC 签名 Cookie(`lib/session.ts`),无状态,天然适配 Serverless;
- 数据库连接只读 `DATABASE_URL` 环境变量(`lib/db.ts`),Neon 注入的连接串自带连接池与 SSL;
- 单词发音走有道 dictvoice,浏览器直连,与部署平台无关。

## 一次性部署步骤

### 1. 导入项目

[vercel.com](https://vercel.com) → **Continue with GitHub** 登录 → **Add New → Project** → 选择 `kids-english-family` 仓库导入。框架自动识别为 Next.js,构建设置保持默认。**先不要点 Deploy**,做完第 2、3 步再部署。

### 2. 创建 Neon 数据库

项目 **Storage** 标签 → **Create Database** → 选 **Neon**,区域选 **Singapore**(离国内用户最近)。创建后 Vercel 自动把 `DATABASE_URL` 注入项目环境变量。

免费档 0.5GB 存储,本项目全量数据约 32MB,绰绰有余。注意:闲置 5 分钟后数据库自动休眠,当天首个请求会多约 1 秒唤醒时间,属正常现象。

### 3. 设置环境变量(必须)

项目 **Settings → Environment Variables** 添加:

| 变量          | 值                                                    | 说明                                           |
| ------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `AUTH_SECRET` | 随机长字符串,本地生成:`openssl rand -hex 32`         | 会话签名密钥,公网部署必须设置,否则无法登录   |
| `DATABASE_URL` | Neon 连接串(自动注入)或自建数据库连接串 | 数据库连接,Vercel + Neon 部署时自动注入无需手动设置 |

**注意**:`AUTH_SECRET` 不设置时会话签名退回仓库里的公开默认密钥,任何人都能伪造登录,绝不可省略。

### 4. 导入数据

从 Neon 控制台复制**直连**(非 pooler)连接串,在任何装有 psql 且有本仓库的机器上执行:

```bash
psql "postgres://<user>:<password>@<host>/neondb?sslmode=require" \
  -f db/backup/kids_english_family.sql
```

备份包含 schema + 全部数据(358 本词书、19811 个单词、demo 账号),几分钟导完。**不要**再执行 `db/init/` 下的脚本,备份和初始化脚本二选一。

> 备份中包含演示账号 `demo@example.com`(密码:`demo123456`),可用于测试。

### 4.5 创建真实用户账号(可选)

如果需要创建新用户,使用脚本自动创建用户和默认学生档案:

```bash
# 本地运行(需要能连接 Neon 数据库)
node scripts/create-user.js <邮箱> <密码> [用户昵称]

# 示例
node scripts/create-user.js parent@example.com mypassword "张三"
```

脚本会自动:
- ✅ 创建用户账号
- ✅ 创建默认学生档案(小学一年级)
- ✅ 生成学生统计记录

用户创建后可直接登录,无需再手动设置,所有数据齐全。

**DATABASE_URL 设置**:如果在本地运行脚本,需要设置数据库连接:

```bash
# 方式 1: 环境变量指定 Neon 连接串
export DATABASE_URL="postgres://user:password@host/neondb?sslmode=require"
node scripts/create-user.js parent@example.com mypassword

# 方式 2: 也可以连接本地 PostgreSQL 做测试
export DATABASE_URL="postgres://kids_english:kids_english_dev@localhost:5432/kids_english_family"
node scripts/create-user.js parent@example.com mypassword
```

### 5. 部署

回到 Vercel 点 **Deploy**。完成后:

- 每次 `git push origin main` 自动重新部署;
- Pull Request 自动生成预览环境。

### 6. 绑定自定义域名(国内访问必需)

`*.vercel.app` 在国内大陆基本无法访问。到 **Settings → Domains** 添加自己的域名,按提示在域名 DNS 加一条 CNAME 指向 `cname.vercel-dns.com`。HTTPS 证书自动签发,域名无需备案(服务器不在国内)。

## 日常维护

- **改代码**:本地提交后 `git push origin main`,Vercel 自动构建上线,无需登录控制台;
- **数据备份**:数据在 Neon 云端,建议定期导出一份逻辑备份更新到仓库:

  ```bash
  pg_dump "<Neon 直连连接串>" --no-owner --no-privileges > db/backup/kids_english_family.sql
  ```

- **查看日志**:Vercel 项目 → **Logs** 标签可看每个 API 请求的运行日志与报错。

## 费用一览(家庭自用规模)

| 项目         | 额度                                    | 费用                  |
| ------------ | --------------------------------------- | --------------------- |
| Vercel Hobby | 个人非商用,100GB 流量/月                | 免费                  |
| Neon         | 0.5GB 存储,约 190 计算小时/月(自动休眠) | 免费                  |
| GitHub       | 代码托管 + 自动部署触发                 | 免费                  |
| 自定义域名   | —                                       | 约 ¥10–80/年,唯一开销 |

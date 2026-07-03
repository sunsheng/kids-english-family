# 快速开始指南

## 本地开发环境

### 1. 初始化数据库

首次运行需要导入 schema 和示例数据：

```bash
# 方式 A: 使用完整备份（包含 358 本词书、demo 账号）
psql postgres://kids_english:kids_english_dev@localhost:5432/kids_english_family \
  -f db/backup/kids_english_family.sql

# 方式 B: 从零开始初始化（仅包含 schema）
psql postgres://kids_english:kids_english_dev@localhost:5432/kids_english_family \
  -f db/init/001_schema.sql \
  -f db/init/002_settings_and_test_progress.sql
```

### 2. 创建用户账号

```bash
# 快速创建：自动生成用户 + 学生档案（小学一年级）
node scripts/create-user.js <邮箱> <密码> [用户昵称]

# 示例
node scripts/create-user.js parent@example.com mypassword "张三"
```

✅ 脚本会自动：
- 创建用户账号
- 创建默认学生档案（小学一年级）
- 生成学生统计记录

用户创建后可直接登录，无需其他配置。

### 3. 启动开发服务器

```bash
npm install
npm run dev
```

访问 http://localhost:3000

---

## 正式环境部署（Vercel + Neon）

### 详细步骤

参考 [部署到 Vercel](docs/deploy-vercel.md)

### 简明流程

1. 在 Vercel 导入项目
2. 创建 Neon 数据库（自动注入 `DATABASE_URL`）
3. 设置 `AUTH_SECRET` 环境变量
4. 导入数据库备份：
   ```bash
   psql "<Neon 连接串>" -f db/backup/kids_english_family.sql
   ```
5. 创建用户：
   ```bash
   export DATABASE_URL="<Neon 连接串>"
   node scripts/create-user.js <邮箱> <密码> [昵称]
   ```
6. 点击 Deploy 完成

---

## 账号管理

### 演示账号（自动导入）

- 邮箱：`demo@example.com`
- 密码：`demo123456`

### 创建新账号

```bash
node scripts/create-user.js parent@example.com secure_password "李四"
```

创建后用户可直接登录，所有学习档案和设置齐全。

---

## 常见操作

### 修改学生档案

登录后进入 **设置** → **编辑学习档案**，可修改：
- 学生名字
- 学段（小学/初中/高中）
- 年级
- 教材版本
- 发音偏好（美音/英音）

### 备份数据

```bash
pg_dump "<DATABASE_URL>" --no-owner --no-privileges > db/backup/kids_english_family.sql
```

### 查看数据库日志

```bash
psql "<DATABASE_URL>"
\dt  # 列出所有表
SELECT * FROM users;  # 查看用户
SELECT * FROM students WHERE user_id = '<user_id>';  # 查看学生档案
```

---

## 技术栈

- **前端**：Next.js 14 (App Router) + React 18
- **后端**：Next.js API Routes
- **数据库**：PostgreSQL 15+
- **部署**：Vercel (应用) + Neon (数据库)
- **认证**：HMAC 签名 Cookie (无状态)

---

## 常见问题

**Q: 如何重置用户密码？**

A: 目前无 web UI 修改密码，可直接修改数据库：
```bash
node scripts/create-user.js <新邮箱> <新密码>  # 创建新账号
```

**Q: 如何删除用户？**

A: 用户关联的所有学习进度通过外键级联删除。如需删除用户：
```sql
DELETE FROM users WHERE email = 'xxx@example.com';
```

**Q: 学生档案会在用户第一次登录时自动创建吗？**

A: 
- 使用脚本创建用户时，档案已经创建
- 如果手动插入用户，第一次登录时系统会自动创建默认档案

**Q: 可以一个账号管理多个学生吗？**

A: 当前设计是一个账号对应一个学生档案。要支持多个学生需要修改 UI。

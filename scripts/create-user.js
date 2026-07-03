#!/usr/bin/env node

const crypto = require("crypto");
const { Pool } = require("pg");

// 读取命令行参数
const email = process.argv[2];
const password = process.argv[3];
const nickname = process.argv[4];

if (!email || !password) {
  console.error("用法: node scripts/create-user.js <email> <password> [nickname]");
  console.error("示例: node scripts/create-user.js parent@example.com mypassword 张三");
  process.exit(1);
}

// 生成密码哈希
function hashPassword(password) {
  const ITERATIONS = 100000;
  const SALT = "phase2-custom-salt";
  const hash = crypto.pbkdf2Sync(password, SALT, ITERATIONS, 64, "sha512").toString("hex");
  return `pbkdf2$${ITERATIONS}$${SALT}$${hash}`;
}

// 连接数据库并创建用户和学生档案
async function createUser() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgres://kids_english:kids_english_dev@localhost:5432/kids_english_family`,
  });

  try {
    const passwordHash = hashPassword(password);

    // 1. 创建用户
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, nickname)
       VALUES ($1, $2, $3)
       RETURNING id, email, nickname`,
      [email.toLowerCase(), passwordHash, nickname || null]
    );

    const user = userResult.rows[0];

    // 2. 自动创建默认学生档案
    const studentResult = await pool.query(
      `INSERT INTO students (user_id, name, school_stage, grade_label, preferred_accent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, name, school_stage, grade_label`,
      [user.id, `${user.nickname || "学员"} 的学习档案`, "primary", "一年级", "us"]
    );

    const student = studentResult.rows[0];

    // 3. 创建学生统计记录
    await pool.query(
      `INSERT INTO student_stats (student_id) VALUES ($1)`,
      [student.id]
    );

    console.log("\n✅ 用户和学生档案创建成功！");
    console.log("\n📋 用户信息：");
    console.log(`   邮箱: ${user.email}`);
    console.log(`   昵称: ${user.nickname || "(未设置)"}`);
    console.log("\n🎓 学生档案：");
    console.log(`   档案名: ${student.name}`);
    console.log(`   学段: ${student.school_stage === "primary" ? "小学" : "初中/高中"}`);
    console.log(`   年级: ${student.grade_label}`);
    console.log("\n🚀 用户可以直接登录使用！");

  } catch (error) {
    if (error.code === "23505") {
      console.error("❌ 邮箱已存在");
    } else {
      console.error("❌ 创建用户失败:", error.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createUser();

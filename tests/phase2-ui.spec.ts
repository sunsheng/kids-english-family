import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER ?? "kids_english"}:${
      process.env.POSTGRES_PASSWORD ?? "kids_english_dev"
    }@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? "5432"}/${
      process.env.POSTGRES_DB ?? "kids_english_family"
    }`,
});

test.beforeEach(async () => {
  await pool.query("UPDATE students SET deleted_at = now() WHERE name LIKE '测试学员%'");
  await pool.query(
    "DELETE FROM learning_records WHERE student_id = '10000000-0000-0000-0000-000000000001'",
  );
  await pool.query(
    `
      UPDATE study_plans
      SET cursor_order_index = 0,
          daily_new_word_count = 20,
          status = 'in_progress',
          updated_at = now()
      WHERE id = '50000000-0000-0000-0000-000000000001'
    `,
  );
});

test.afterAll(async () => {
  await pool.query("UPDATE students SET deleted_at = now() WHERE name LIKE '测试学员%'");
  await pool.end();
});

test("phase 2 core UI flow", async ({ page }) => {
  const studentName = `测试学员${Date.now().toString().slice(-4)}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "家长登录" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/01-login.png", fullPage: true });

  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.getByLabel("密码").fill("demo123456");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
  await expect(page.getByText("当前学员：小明")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/02-dashboard.png", fullPage: true });

  await page.getByRole("button", { name: "新增学员" }).click();
  await expect(page.getByRole("heading", { name: "新增学员" })).toBeVisible();
  await page.getByLabel("姓名").fill(studentName);
  await page.getByLabel("学段").selectOption("senior");
  await page.getByLabel("年级").fill("高一");
  await page.getByLabel("发音偏好").selectOption("uk");
  await page.screenshot({
    path: "test-results/phase2-ui/03-student-form-filled.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("button", { name: `${studentName} 高中高一 · 英音` })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/04-student-created.png", fullPage: true });

  await page.getByRole("button", { name: "小明 小学五年级 · 美音" }).click();
  await expect(page.getByText("当前学员：小明")).toBeVisible();

  await page.getByRole("button", { name: "选词库" }).click();
  await expect(page.getByRole("heading", { name: "选词库" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/05-library.png", fullPage: true });

  await page
    .locator(".book-card")
    .filter({ has: page.getByRole("heading", { name: "人教版五年级上册" }) })
    .getByRole("button")
    .click();
  await expect(page.getByRole("dialog", { name: "人教版五年级上册" })).toBeVisible();
  await page.getByRole("button", { name: "10" }).click();
  await page.screenshot({ path: "test-results/phase2-ui/06-plan-dialog.png", fullPage: true });
  await page.getByRole("button", { name: "开启计划" }).click();

  await expect(page.getByRole("heading", { name: "学习室" })).toBeVisible();
  await expect(page.locator(".word-card")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/07-learning-front.png", fullPage: true });

  await page.locator(".word-card").click();
  await expect(page.locator(".word-detail")).toBeVisible();
  await page.keyboard.press("KeyR");
  await page.screenshot({ path: "test-results/phase2-ui/08-learning-flipped.png", fullPage: true });

  const currentWord = await page.locator(".word-spelling").innerText();
  await page.getByRole("button", { name: "不认识" }).click();
  await expect(page.locator(".word-spelling")).not.toHaveText(currentWord);
  await page.screenshot({ path: "test-results/phase2-ui/09-after-record.png", fullPage: true });

  await page.getByRole("button", { name: `删除 ${studentName}` }).click();
  await expect(page.getByText(studentName)).toHaveCount(0);
});

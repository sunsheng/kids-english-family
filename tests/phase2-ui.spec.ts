import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { createDrillRounds } from "../lib/spelling-drill";

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
    "DELETE FROM daily_study_logs WHERE student_id = '10000000-0000-0000-0000-000000000001'",
  );
  await pool.query(
    `
      UPDATE student_stats
      SET total_words_mastered = 0,
          current_streak_days = 0,
          longest_streak_days = 0,
          last_study_date = NULL,
          updated_at = now()
      WHERE student_id = '10000000-0000-0000-0000-000000000001'
    `,
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

async function completeSpellingDrill(page: import("@playwright/test").Page, word: string) {
  const rounds = createDrillRounds(word);

  for (const round of rounds) {
    const answer = word.toLowerCase().slice(round.start, round.start + round.length);
    await page.keyboard.type(answer);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(350);
  }
}

test.afterAll(async () => {
  await pool.query("UPDATE students SET deleted_at = now() WHERE name LIKE '测试学员%'");
  await pool.end();
});

test("phase 3 learning, review, vocabulary, and stats flow", async ({ page }) => {
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
  await page.screenshot({ path: "test-results/phase2-ui/06-plan-started.png", fullPage: true });

  await expect(page.getByRole("heading", { name: "学习室" })).toBeVisible();
  await expect(page.locator(".word-card")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/07-learning-front.png", fullPage: true });

  await page.locator(".word-card").click();
  await expect(page.locator(".word-detail")).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowDown");
  await page.screenshot({ path: "test-results/phase2-ui/08-learning-flipped.png", fullPage: true });
  await expect(page.getByLabel("拼写三轮巩固")).toHaveCount(0);

  const currentWord = await page.locator(".word-spelling").innerText();
  await page.getByRole("button", { name: "不认识" }).click();
  await expect(page.locator(".word-spelling")).not.toHaveText(currentWord);
  const testWord = await page.locator(".word-spelling").innerText();
  await page.screenshot({ path: "test-results/phase2-ui/09-after-record.png", fullPage: true });

  await page.getByRole("button", { name: "开始测试" }).click();
  await expect(page.getByRole("heading", { name: "测试" })).toBeVisible();
  await expect(page.getByLabel("拼写三轮巩固")).toBeVisible();
  await completeSpellingDrill(page, testWord);
  await expect(page.getByRole("heading", { name: "测试" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/10-test-complete.png", fullPage: true });

  await pool.query(
    `
      UPDATE learning_records lr
      SET next_review_at = CURRENT_DATE
      FROM words w
      WHERE lr.word_id = w.id
        AND lr.student_id = '10000000-0000-0000-0000-000000000001'
        AND w.spelling = $1
    `,
    [currentWord],
  );

  await page.getByRole("button", { name: "生词本" }).click();
  await expect(page.getByRole("heading", { name: "生词本" })).toBeVisible();
  await expect(page.getByRole("heading", { name: currentWord })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/11-vocabulary.png", fullPage: true });

  await page.getByRole("button", { name: "复习中心" }).click();
  await expect(page.getByRole("heading", { name: "复习中心" })).toBeVisible();
  await expect(page.getByRole("heading", { name: currentWord })).toBeVisible();
  await page
    .locator(".vocab-item")
    .filter({ has: page.getByRole("heading", { name: currentWord }) })
    .getByRole("button", { name: "开始测试" })
    .click();
  await expect(page.getByRole("heading", { name: "测试" })).toBeVisible();
  await completeSpellingDrill(page, currentWord);
  await expect(page.getByRole("heading", { name: "复习中心" })).toBeVisible();
  await expect(page.getByText("今天没有到期复习词。")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/12-review-complete.png", fullPage: true });

  await page.getByRole("button", { name: "统计" }).click();
  await expect(page.getByRole("heading", { name: "统计" })).toBeVisible();
  await expect(page.getByText("待复习")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/13-stats.png", fullPage: true });

  await page.getByRole("button", { name: `删除 ${studentName}` }).click();
  await expect(page.getByText(studentName)).toHaveCount(0);
});

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
  await pool.query(
    "DELETE FROM learning_records WHERE student_id = '10000000-0000-0000-0000-000000000001'",
  );
  await pool.query(
    "DELETE FROM daily_study_logs WHERE student_id = '10000000-0000-0000-0000-000000000001'",
  );
  await pool.query(
    "DELETE FROM test_progress WHERE student_id = '10000000-0000-0000-0000-000000000001'",
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
  await pool.query(
    `
      UPDATE study_plans
      SET status = 'paused', updated_at = now()
      WHERE student_id = '10000000-0000-0000-0000-000000000001'
        AND id != '50000000-0000-0000-0000-000000000001'
        AND status = 'in_progress'
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
  await pool.end();
});

test("phase 3 learning, review, vocabulary, and stats flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/01-login.png", fullPage: true });

  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.getByLabel("密码").fill("demo123456");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
  await expect(page.getByText("当前学员：小明")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/02-dashboard.png", fullPage: true });

  await page.getByRole("button", { name: "选词库" }).click();
  await expect(page.getByRole("heading", { name: "选词库" })).toBeVisible();
  // 默认按学习档案(小学五年级)推荐词书,可切换查看全部
  await expect(page.getByRole("button", { name: "推荐词书" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "人教版五年级上册", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "仁爱版初中英语七年级上册" })).toHaveCount(0);
  await page.getByRole("button", { name: "全部词书" }).click();
  await page.getByLabel("搜索词书").fill("仁爱版初中英语七年级上册");
  await expect(page.getByRole("heading", { name: "仁爱版初中英语七年级上册" })).toBeVisible();
  await page.getByLabel("搜索词书").fill("");
  await page.getByRole("button", { name: "推荐词书" }).click();
  await page.screenshot({ path: "test-results/phase2-ui/05-library.png", fullPage: true });

  await page
    .locator(".book-card")
    .filter({ has: page.getByRole("heading", { name: "人教版五年级上册", exact: true }) })
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
  const secondLearningWord = await page.locator(".word-spelling").innerText();
  await page.screenshot({ path: "test-results/phase2-ui/09-after-record.png", fullPage: true });

  // 词书测试:独立的测试游标从词书第 1 个词开始(即 currentWord),
  // 且完成测试不会影响学习进度。
  await page.getByRole("button", { name: "开始测试" }).click();
  await expect(page.getByRole("heading", { name: "测试" })).toBeVisible();
  await expect(page.getByLabel("拼写三轮巩固")).toBeVisible();
  await expect(page.getByText("第 1 阶段")).toBeVisible();
  await completeSpellingDrill(page, currentWord);
  await expect(page.getByRole("heading", { name: "测试" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/10-test-complete.png", fullPage: true });

  // 回到学习室:学习进度不受测试影响,仍停在第二个学习词
  await page
    .getByRole("navigation", { name: "功能导航" })
    .getByRole("button", { name: "开始学习" })
    .click();
  await expect(page.locator(".word-spelling")).toHaveText(secondLearningWord);

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

  // 设置页:一个账号只有一份学习档案,可编辑学段/年级/教材版本/口音
  await page.getByRole("button", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "用户设置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "学习档案" })).toBeVisible();
  await page.getByRole("button", { name: "编辑学习档案" }).first().click();
  await expect(page.getByRole("heading", { name: "编辑学习档案" })).toBeVisible();
  await expect(page.getByLabel("教材版本")).toBeVisible();
  await page.getByLabel("教材版本").selectOption("人教版");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("小学五年级 · 美音 · 人教版")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-ui/14-settings.png", fullPage: true });

  // 恢复教材版本为不限,避免影响其他用例
  await page.getByRole("button", { name: "编辑学习档案" }).first().click();
  await page.getByLabel("教材版本").selectOption("");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("小学五年级 · 美音 · 教材版本不限")).toBeVisible();
});

test("study progress is kept per book when switching between books", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.getByLabel("密码").fill("demo123456");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();

  // 在默认词书学习 1 个词
  await page
    .getByRole("navigation", { name: "功能导航" })
    .getByRole("button", { name: "开始学习" })
    .click();
  await expect(page.locator(".word-card")).toBeVisible();
  await page.getByRole("button", { name: "认识", exact: true }).click();
  await expect(page.getByText("学到 2/6")).toBeVisible();

  // 切到另一本词书(自动暂停原计划,进度保留)
  await page.getByRole("button", { name: "选词库" }).click();
  await page.getByRole("button", { name: "全部词书" }).click();
  await page.getByLabel("搜索词书").fill("小学核心词");
  await page
    .locator(".book-card")
    .filter({ has: page.getByRole("heading", { name: "小学核心词", exact: true }) })
    .getByRole("button")
    .click();
  await expect(page.getByRole("heading", { name: "学习室" })).toBeVisible();
  await expect(page.getByText("学到 1/3")).toBeVisible();

  // 切回原词书:进度必须还在(学到 2/6)
  await page.getByRole("button", { name: "选词库" }).click();
  await page.getByRole("button", { name: "推荐词书" }).click();
  await page
    .locator(".book-card")
    .filter({ has: page.getByRole("heading", { name: "人教版五年级上册", exact: true }) })
    .getByRole("button", { name: "继续学习" })
    .click();
  await expect(page.getByRole("heading", { name: "学习室" })).toBeVisible();
  await expect(page.getByText("学到 2/6")).toBeVisible();
});

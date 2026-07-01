import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type DashboardRow = {
  total_words_mastered: number;
  current_streak_days: number;
  longest_streak_days: number;
  today_new_words: number;
  today_review_words: number;
  review_due_count: number;
  vocab_book_count: number;
};

type HeatmapRow = {
  study_date: string;
  new_words_count: number;
  review_words_count: number;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");

  if (!studentId) {
    return NextResponse.json({ error: "缺少 studentId。" }, { status: 400 });
  }

  const [summary, heatmap] = await Promise.all([
    query<DashboardRow>(
      `
        SELECT
          COALESCE(ss.total_words_mastered, 0)::int AS total_words_mastered,
          COALESCE(ss.current_streak_days, 0)::int AS current_streak_days,
          COALESCE(ss.longest_streak_days, 0)::int AS longest_streak_days,
          COALESCE(today.new_words_count, 0)::int AS today_new_words,
          COALESCE(today.review_words_count, 0)::int AS today_review_words,
          (
            SELECT count(*)::int
            FROM learning_records lr
            WHERE lr.student_id = $1
              AND lr.next_review_at <= CURRENT_DATE
          ) AS review_due_count,
          (
            SELECT count(*)::int
            FROM learning_records lr
            WHERE lr.student_id = $1
              AND lr.is_in_vocab_book = true
          ) AS vocab_book_count
        FROM (SELECT $1::uuid AS student_id) student
        LEFT JOIN student_stats ss ON ss.student_id = student.student_id
        LEFT JOIN daily_study_logs today
          ON today.student_id = student.student_id
         AND today.study_date = CURRENT_DATE
      `,
      [studentId],
    ),
    query<HeatmapRow>(
      `
        SELECT study_date, new_words_count, review_words_count
        FROM daily_study_logs
        WHERE student_id = $1
          AND study_date >= CURRENT_DATE - 13
        ORDER BY study_date ASC
      `,
      [studentId],
    ),
  ]);

  return NextResponse.json({
    summary: summary.rows[0] ?? {
      total_words_mastered: 0,
      current_streak_days: 0,
      longest_streak_days: 0,
      today_new_words: 0,
      today_review_words: 0,
      review_due_count: 0,
      vocab_book_count: 0,
    },
    heatmap: heatmap.rows,
  });
}

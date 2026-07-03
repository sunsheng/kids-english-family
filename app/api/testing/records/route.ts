import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { scheduleReview } from "@/lib/srs";

export const runtime = "nodejs";

// 记录一次拼写测试结果:更新 SM-2 复习调度和统计,推进该词书的测试游标,
// 但绝不触碰 study_plans.cursor_order_index(学习进度与测试进度隔离)。
export async function POST(request: Request) {
  const body = (await request.json()) as {
    studentId?: string;
    wordId?: string;
    wordBookId?: string;
    entryOrderIndex?: number;
    result?: "correct" | "wrong";
  };

  const isCorrect = body.result === "correct";
  const isWrong = body.result === "wrong";

  if (
    !body.studentId ||
    !body.wordId ||
    !body.wordBookId ||
    typeof body.entryOrderIndex !== "number" ||
    (!isCorrect && !isWrong)
  ) {
    return NextResponse.json({ error: "测试记录信息不完整。" }, { status: 400 });
  }

  const current = await query<{
    ease_factor: number;
    interval_days: number;
    repetitions: number;
  }>(
    `
      SELECT ease_factor, interval_days, repetitions
      FROM learning_records
      WHERE student_id = $1
        AND word_id = $2
      LIMIT 1
    `,
    [body.studentId, body.wordId],
  );
  const nextSchedule = scheduleReview(
    {
      easeFactor: current.rows[0]?.ease_factor ?? 2.5,
      intervalDays: current.rows[0]?.interval_days ?? 0,
      repetitions: current.rows[0]?.repetitions ?? 0,
    },
    isCorrect,
  );

  await query(
    `
      INSERT INTO learning_records (
        student_id,
        word_id,
        status,
        is_in_vocab_book,
        ease_factor,
        interval_days,
        repetitions,
        next_review_at,
        times_seen,
        times_correct,
        times_wrong,
        first_learned_at,
        last_reviewed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE + $8::int, 1, $9, $10, now(), now())
      ON CONFLICT (student_id, word_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        is_in_vocab_book = learning_records.is_in_vocab_book OR EXCLUDED.is_in_vocab_book,
        ease_factor = EXCLUDED.ease_factor,
        interval_days = EXCLUDED.interval_days,
        repetitions = EXCLUDED.repetitions,
        next_review_at = EXCLUDED.next_review_at,
        times_seen = learning_records.times_seen + 1,
        times_correct = learning_records.times_correct + EXCLUDED.times_correct,
        times_wrong = learning_records.times_wrong + EXCLUDED.times_wrong,
        first_learned_at = COALESCE(learning_records.first_learned_at, now()),
        last_reviewed_at = now(),
        updated_at = now()
    `,
    [
      body.studentId,
      body.wordId,
      nextSchedule.status,
      isWrong,
      nextSchedule.easeFactor,
      nextSchedule.intervalDays,
      nextSchedule.repetitions,
      nextSchedule.nextReviewInDays,
      isCorrect ? 1 : 0,
      isWrong ? 1 : 0,
    ],
  );

  const progress = await query<{ cursor_order_index: number; stage_size: number }>(
    `
      INSERT INTO test_progress (student_id, word_book_id, cursor_order_index)
      VALUES ($1, $2, $3)
      ON CONFLICT ON CONSTRAINT uq_test_progress_student_book
      DO UPDATE SET
        cursor_order_index = greatest(test_progress.cursor_order_index, EXCLUDED.cursor_order_index),
        updated_at = now()
      RETURNING cursor_order_index, stage_size
    `,
    [body.studentId, body.wordBookId, body.entryOrderIndex],
  );

  await query(
    `
      INSERT INTO daily_study_logs (student_id, study_date, new_words_count, review_words_count)
      VALUES ($1, CURRENT_DATE, 0, 1)
      ON CONFLICT (student_id, study_date)
      DO UPDATE SET
        review_words_count = daily_study_logs.review_words_count + 1
    `,
    [body.studentId],
  );

  return NextResponse.json({ progress: progress.rows[0] });
}

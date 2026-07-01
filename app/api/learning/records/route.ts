import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { scheduleReview } from "@/lib/srs";

export const runtime = "nodejs";

type LearningRecordRow = {
  id: string;
  status: "learning" | "reviewing" | "mastered";
  is_in_vocab_book: boolean;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  times_seen: number;
  times_correct: number;
  times_wrong: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    studentId?: string;
    wordId?: string;
    studyPlanId?: string;
    entryOrderIndex?: number;
    result?: "known" | "unknown" | "correct" | "wrong";
    mode?: "new" | "review";
  };

  const isCorrect = body.result === "known" || body.result === "correct";
  const isWrong = body.result === "unknown" || body.result === "wrong";
  const mode = body.mode ?? "new";

  if (
    !body.studentId ||
    !body.wordId ||
    (!isCorrect && !isWrong) ||
    (mode === "new" && (!body.studyPlanId || typeof body.entryOrderIndex !== "number"))
  ) {
    return NextResponse.json({ error: "学习记录信息不完整。" }, { status: 400 });
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

  const record = await query<LearningRecordRow>(
    `
      INSERT INTO learning_records (
        student_id,
        word_id,
        study_plan_id,
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        CURRENT_DATE + $9::int,
        1,
        $10,
        $11,
        now(),
        now()
      )
      ON CONFLICT (student_id, word_id)
      DO UPDATE SET
        study_plan_id = COALESCE(EXCLUDED.study_plan_id, learning_records.study_plan_id),
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
      RETURNING
        id,
        status,
        is_in_vocab_book,
        ease_factor,
        interval_days,
        repetitions,
        times_seen,
        times_correct,
        times_wrong
    `,
    [
      body.studentId,
      body.wordId,
      body.studyPlanId ?? null,
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

  if (mode === "new") {
    await query(
      `
        UPDATE study_plans
        SET cursor_order_index = greatest(cursor_order_index, $2),
            status = 'in_progress',
            updated_at = now()
        WHERE id = $1
      `,
      [body.studyPlanId, body.entryOrderIndex],
    );
  }

  await query(
    `
      INSERT INTO daily_study_logs (
        student_id,
        study_date,
        new_words_count,
        review_words_count
      )
      VALUES ($1, CURRENT_DATE, $2, $3)
      ON CONFLICT (student_id, study_date)
      DO UPDATE SET
        new_words_count = daily_study_logs.new_words_count + EXCLUDED.new_words_count,
        review_words_count = daily_study_logs.review_words_count + EXCLUDED.review_words_count
    `,
    [body.studentId, mode === "new" ? 1 : 0, mode === "review" ? 1 : 0],
  );

  await query(
    `
      INSERT INTO student_stats (student_id, total_words_mastered, current_streak_days, longest_streak_days, last_study_date)
      VALUES ($1, $2, 1, 1, CURRENT_DATE)
      ON CONFLICT (student_id)
      DO UPDATE SET
        total_words_mastered = (
          SELECT count(*)::int
          FROM learning_records
          WHERE student_id = $1
            AND status = 'mastered'
        ),
        current_streak_days = CASE
          WHEN student_stats.last_study_date = CURRENT_DATE THEN student_stats.current_streak_days
          WHEN student_stats.last_study_date = CURRENT_DATE - 1 THEN student_stats.current_streak_days + 1
          ELSE 1
        END,
        longest_streak_days = greatest(
          student_stats.longest_streak_days,
          CASE
            WHEN student_stats.last_study_date = CURRENT_DATE THEN student_stats.current_streak_days
            WHEN student_stats.last_study_date = CURRENT_DATE - 1 THEN student_stats.current_streak_days + 1
            ELSE 1
          END
        ),
        last_study_date = CURRENT_DATE,
        updated_at = now()
    `,
    [body.studentId, isCorrect ? 1 : 0],
  );

  return NextResponse.json({ record: record.rows[0] });
}

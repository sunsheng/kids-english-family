import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type LearningRecordRow = {
  id: string;
  status: "learning" | "mastered";
  is_in_vocab_book: boolean;
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
    result?: "known" | "unknown";
  };

  if (
    !body.studentId ||
    !body.wordId ||
    !body.studyPlanId ||
    typeof body.entryOrderIndex !== "number" ||
    (body.result !== "known" && body.result !== "unknown")
  ) {
    return NextResponse.json({ error: "学习记录信息不完整。" }, { status: 400 });
  }

  const isKnown = body.result === "known";
  const record = await query<LearningRecordRow>(
    `
      INSERT INTO learning_records (
        student_id,
        word_id,
        study_plan_id,
        status,
        is_in_vocab_book,
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
        CURRENT_DATE + 1,
        1,
        $6,
        $7,
        now(),
        now()
      )
      ON CONFLICT (student_id, word_id)
      DO UPDATE SET
        study_plan_id = EXCLUDED.study_plan_id,
        status = EXCLUDED.status,
        is_in_vocab_book = learning_records.is_in_vocab_book OR EXCLUDED.is_in_vocab_book,
        next_review_at = EXCLUDED.next_review_at,
        times_seen = learning_records.times_seen + 1,
        times_correct = learning_records.times_correct + EXCLUDED.times_correct,
        times_wrong = learning_records.times_wrong + EXCLUDED.times_wrong,
        first_learned_at = COALESCE(learning_records.first_learned_at, now()),
        last_reviewed_at = now(),
        updated_at = now()
      RETURNING id, status, is_in_vocab_book, times_seen, times_correct, times_wrong
    `,
    [
      body.studentId,
      body.wordId,
      body.studyPlanId,
      isKnown ? "mastered" : "learning",
      !isKnown,
      isKnown ? 1 : 0,
      isKnown ? 0 : 1,
    ],
  );

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

  await query(
    `
      INSERT INTO daily_study_logs (student_id, study_date, new_words_count)
      VALUES ($1, CURRENT_DATE, 1)
      ON CONFLICT (student_id, study_date)
      DO UPDATE SET new_words_count = daily_study_logs.new_words_count + 1
    `,
    [body.studentId],
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
    [body.studentId, isKnown ? 1 : 0],
  );

  return NextResponse.json({ record: record.rows[0] });
}

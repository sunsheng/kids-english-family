import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type StudyPlanRow = {
  id: string;
  student_id: string;
  word_book_id: string;
  daily_new_word_count: number;
  status: "not_started" | "in_progress" | "completed" | "paused";
  cursor_order_index: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    studentId?: string;
    wordBookId?: string;
    dailyNewWordCount?: number;
  };
  const { studentId, wordBookId } = body;
  const dailyNewWordCount = body.dailyNewWordCount;

  if (!studentId || !wordBookId || ![10, 20, 30].includes(dailyNewWordCount ?? 0)) {
    return NextResponse.json({ error: "学习计划信息不完整。" }, { status: 400 });
  }

  await query(
    `
      UPDATE study_plans
      SET status = 'paused',
          updated_at = now()
      WHERE student_id = $1
        AND word_book_id != $2
        AND status = 'in_progress'
    `,
    [studentId, wordBookId],
  );

  const existing = await query<StudyPlanRow>(
    `
      SELECT id, student_id, word_book_id, daily_new_word_count, status, cursor_order_index
      FROM study_plans
      WHERE student_id = $1
        AND word_book_id = $2
        AND status IN ('not_started', 'in_progress', 'paused')
      LIMIT 1
    `,
    [studentId, wordBookId],
  );

  if (existing.rows[0]) {
    const updated = await query<StudyPlanRow>(
      `
        UPDATE study_plans
        SET daily_new_word_count = $2,
            status = 'in_progress',
            started_at = COALESCE(started_at, now()),
            updated_at = now()
        WHERE id = $1
        RETURNING id, student_id, word_book_id, daily_new_word_count, status, cursor_order_index
      `,
      [existing.rows[0].id, dailyNewWordCount],
    );

    return NextResponse.json({ studyPlan: updated.rows[0] });
  }

  const created = await query<StudyPlanRow>(
    `
      INSERT INTO study_plans (
        student_id,
        word_book_id,
        daily_new_word_count,
        status,
        started_at
      )
      VALUES ($1, $2, $3, 'in_progress', now())
      RETURNING id, student_id, word_book_id, daily_new_word_count, status, cursor_order_index
    `,
    [studentId, wordBookId, dailyNewWordCount],
  );

  return NextResponse.json({ studyPlan: created.rows[0] }, { status: 201 });
}

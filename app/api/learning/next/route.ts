import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type LearningWordRow = {
  study_plan_id: string;
  word_book_name: string;
  daily_new_word_count: number;
  cursor_order_index: number;
  entry_order_index: number;
  completed_count: number;
  word_id: string;
  spelling: string;
  phonetic_us: string | null;
  phonetic_uk: string | null;
  audio_us_url: string | null;
  audio_uk_url: string | null;
  definitions: { pos?: string; meaning: string }[];
  example_sentence: string | null;
  example_translation: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");

  if (!studentId) {
    return NextResponse.json({ error: "缺少 studentId。" }, { status: 400 });
  }

  const result = await query<LearningWordRow>(
    `
      WITH active_plan AS (
        SELECT sp.*, wb.name AS word_book_name
        FROM study_plans sp
        JOIN word_books wb ON wb.id = sp.word_book_id
        WHERE sp.student_id = $1
          AND sp.status IN ('not_started', 'in_progress', 'paused')
        ORDER BY sp.updated_at DESC
        LIMIT 1
      ),
      completed AS (
        SELECT count(*)::int AS completed_count
        FROM word_book_entries e
        JOIN active_plan ap ON ap.word_book_id = e.word_book_id
        JOIN learning_records lr
          ON lr.word_id = e.word_id
         AND lr.student_id = $1
         AND lr.status = 'mastered'
      )
      SELECT
        ap.id AS study_plan_id,
        ap.word_book_name,
        ap.daily_new_word_count,
        ap.cursor_order_index,
        e.order_index AS entry_order_index,
        completed.completed_count,
        w.id AS word_id,
        w.spelling,
        w.phonetic_us,
        w.phonetic_uk,
        w.audio_us_url,
        w.audio_uk_url,
        w.definitions,
        w.example_sentence,
        w.example_translation
      FROM active_plan ap
      CROSS JOIN completed
      JOIN word_book_entries e
        ON e.word_book_id = ap.word_book_id
       AND e.order_index > ap.cursor_order_index
      JOIN words w ON w.id = e.word_id
      ORDER BY e.order_index ASC
      LIMIT 1
    `,
    [studentId],
  );

  if (!result.rows[0]) {
    return NextResponse.json({ word: null });
  }

  return NextResponse.json({ word: result.rows[0] });
}

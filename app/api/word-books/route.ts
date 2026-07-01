import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type WordBookRow = {
  id: string;
  name: string;
  category: "textbook" | "exam_syllabus";
  stage: "primary" | "junior" | "senior";
  publisher: string | null;
  description: string | null;
  total_words: number;
  learned_count: number;
  active_plan_id: string | null;
  plan_status: "not_started" | "in_progress" | "completed" | "paused" | null;
  daily_new_word_count: number | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");

  if (!studentId) {
    return NextResponse.json({ error: "缺少 studentId。" }, { status: 400 });
  }

  const result = await query<WordBookRow>(
    `
      SELECT
        wb.id,
        wb.name,
        wb.category,
        wb.stage,
        wb.publisher,
        wb.description,
        wb.total_words,
        COALESCE(sp.cursor_order_index, 0)::int AS learned_count,
        sp.id AS active_plan_id,
        sp.status AS plan_status,
        sp.daily_new_word_count
      FROM word_books wb
      LEFT JOIN study_plans sp
        ON sp.word_book_id = wb.id
       AND sp.student_id = $1
       AND sp.status IN ('not_started', 'in_progress', 'paused')
      WHERE wb.is_published = true
      ORDER BY wb.stage ASC, wb.category ASC, wb.created_at ASC
    `,
    [studentId],
  );

  return NextResponse.json({ wordBooks: result.rows });
}

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type VocabularyWordRow = {
  record_id: string;
  status: "learning" | "reviewing" | "mastered";
  next_review_at: string | null;
  times_seen: number;
  times_correct: number;
  times_wrong: number;
  word_id: string;
  spelling: string;
  definitions: { pos?: string; meaning: string }[];
  example_sentence: string | null;
  example_translation: string | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const keyword = searchParams.get("keyword")?.trim() ?? "";

  if (!studentId) {
    return NextResponse.json({ error: "缺少 studentId。" }, { status: 400 });
  }

  const result = await query<VocabularyWordRow>(
    `
      SELECT
        lr.id AS record_id,
        lr.status,
        lr.next_review_at,
        lr.times_seen,
        lr.times_correct,
        lr.times_wrong,
        w.id AS word_id,
        w.spelling,
        w.definitions,
        w.example_sentence,
        w.example_translation
      FROM learning_records lr
      JOIN words w ON w.id = lr.word_id
      WHERE lr.student_id = $1
        AND lr.is_in_vocab_book = true
        AND ($2 = '' OR w.spelling ILIKE '%' || $2 || '%')
      ORDER BY lr.updated_at DESC
      LIMIT 100
    `,
    [studentId, keyword],
  );

  return NextResponse.json({ words: result.rows });
}

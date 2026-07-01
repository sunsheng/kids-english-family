import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type ReviewWordRow = {
  record_id: string;
  status: "learning" | "reviewing" | "mastered";
  next_review_at: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  times_seen: number;
  times_correct: number;
  times_wrong: number;
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

  const result = await query<ReviewWordRow>(
    `
      SELECT
        lr.id AS record_id,
        lr.status,
        lr.next_review_at,
        lr.ease_factor,
        lr.interval_days,
        lr.repetitions,
        lr.times_seen,
        lr.times_correct,
        lr.times_wrong,
        w.id AS word_id,
        w.spelling,
        w.phonetic_us,
        w.phonetic_uk,
        w.audio_us_url,
        w.audio_uk_url,
        w.definitions,
        w.example_sentence,
        w.example_translation
      FROM learning_records lr
      JOIN words w ON w.id = lr.word_id
      WHERE lr.student_id = $1
        AND lr.next_review_at <= CURRENT_DATE
      ORDER BY lr.next_review_at ASC, lr.updated_at ASC
      LIMIT 20
    `,
    [studentId],
  );

  return NextResponse.json({ reviews: result.rows });
}

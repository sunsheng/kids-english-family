import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const STAGE_SIZE = 10;

type TestWordRow = {
  word_book_id: string;
  word_book_name: string;
  total_words: number;
  stage_size: number;
  entry_order_index: number;
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

// 测试进度与学习进度完全隔离,按 学员 x 词书 x 单词 记录在 test_records 中。
// 只测"学过且最近一次被标记认识/答对"的词(learning_records.repetitions > 0):
// 没学过或最近一次点了"不认识"/答错的词跳过——本来就不会的词测了没有意义;
// 测对过的词不再重复出现;后学会的词以及测错后重新学会的词按词书顺序自动补测。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const requestedBookId = searchParams.get("wordBookId");

  if (!studentId) {
    return NextResponse.json({ error: "缺少 studentId。" }, { status: 400 });
  }

  const result = await query<TestWordRow>(
    `
      WITH target_book AS (
        SELECT wb.id, wb.name, wb.total_words
        FROM word_books wb
        WHERE ($2::uuid IS NOT NULL AND wb.id = $2::uuid)
           OR ($2::uuid IS NULL AND wb.id = (
                SELECT sp.word_book_id
                FROM study_plans sp
                WHERE sp.student_id = $1
                  AND sp.status = 'in_progress'
                ORDER BY sp.updated_at DESC
                LIMIT 1
              ))
        LIMIT 1
      )
      SELECT
        tb.id AS word_book_id,
        tb.name AS word_book_name,
        tb.total_words,
        $3::int AS stage_size,
        e.order_index AS entry_order_index,
        w.id AS word_id,
        w.spelling,
        w.phonetic_us,
        w.phonetic_uk,
        w.audio_us_url,
        w.audio_uk_url,
        w.definitions,
        w.example_sentence,
        w.example_translation
      FROM target_book tb
      JOIN word_book_entries e ON e.word_book_id = tb.id
      JOIN words w ON w.id = e.word_id
      JOIN learning_records lr
        ON lr.student_id = $1
       AND lr.word_id = w.id
       AND lr.repetitions > 0
      LEFT JOIN test_records tr
        ON tr.student_id = $1
       AND tr.word_book_id = tb.id
       AND tr.word_id = w.id
      WHERE tr.id IS NULL OR tr.last_result = 'wrong'
      ORDER BY e.order_index ASC
      LIMIT 1
    `,
    [studentId, requestedBookId, STAGE_SIZE],
  );

  if (!result.rows[0]) {
    // 区分"没选词书 / 还没有学会的词可测 / 学会的词都测完了",前端好给出准确提示。
    const fallback = await query<{ eligible_count: number }>(
      `
        SELECT (
          SELECT count(*)::int
          FROM word_book_entries e
          JOIN learning_records lr
            ON lr.student_id = $1
           AND lr.word_id = e.word_id
           AND lr.repetitions > 0
          WHERE e.word_book_id = wb.id
        ) AS eligible_count
        FROM word_books wb
        WHERE ($2::uuid IS NOT NULL AND wb.id = $2::uuid)
           OR ($2::uuid IS NULL AND wb.id = (
                SELECT sp.word_book_id
                FROM study_plans sp
                WHERE sp.student_id = $1
                  AND sp.status = 'in_progress'
                ORDER BY sp.updated_at DESC
                LIMIT 1
              ))
        LIMIT 1
      `,
      [studentId, requestedBookId],
    );

    const reason = !fallback.rows[0]
      ? "no_book"
      : fallback.rows[0].eligible_count === 0
        ? "no_learned_words"
        : "completed";

    return NextResponse.json({ word: null, reason });
  }

  return NextResponse.json({ word: result.rows[0] });
}

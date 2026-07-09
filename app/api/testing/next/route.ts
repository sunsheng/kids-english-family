import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type TestWordRow = {
  word_book_id: string;
  word_book_name: string;
  total_words: number;
  test_cursor: number;
  entry_order_index: number;
  stage_size: number;
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

// 测试进度与学习进度完全隔离:按 学员 x 词书 使用 test_progress 独立游标,
// 顺序取下一个待测词,并给出"第 N 阶段"分段信息。
// 只测"学过且最近一次被标记认识/答对"的词(learning_records.repetitions > 0):
// 没学过的词和最近一次点了"不认识"/答错的词会被跳过——本来就不会的词测了没有意义。
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
      ),
      progress AS (
        SELECT
          tb.id AS word_book_id,
          COALESCE(tp.cursor_order_index, 0) AS test_cursor,
          COALESCE(tp.stage_size, 10) AS stage_size
        FROM target_book tb
        LEFT JOIN test_progress tp
          ON tp.word_book_id = tb.id
         AND tp.student_id = $1
      )
      SELECT
        tb.id AS word_book_id,
        tb.name AS word_book_name,
        tb.total_words,
        p.test_cursor,
        p.stage_size,
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
      JOIN progress p ON p.word_book_id = tb.id
      JOIN word_book_entries e
        ON e.word_book_id = tb.id
       AND e.order_index > p.test_cursor
      JOIN words w ON w.id = e.word_id
      JOIN learning_records lr
        ON lr.student_id = $1
       AND lr.word_id = w.id
       AND lr.repetitions > 0
      ORDER BY e.order_index ASC
      LIMIT 1
    `,
    [studentId, requestedBookId],
  );

  if (!result.rows[0]) {
    // 区分"没选词书 / 还没有学会的词可测 / 可测的词都测完了",前端好给出准确提示。
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

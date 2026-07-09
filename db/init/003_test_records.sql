-- 拼写测试进度从"单向游标"改为"按词记录":
-- 后学会的词也能补测,测对过的词不再重复测,测错的词重新学会后自动回到测试队列。
-- test_progress 表保留作历史数据,代码不再读写。
CREATE TABLE IF NOT EXISTS test_records (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    word_book_id    uuid NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
    word_id         uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    last_result     varchar(10) NOT NULL CHECK (last_result IN ('correct', 'wrong')),
    times_tested    integer NOT NULL DEFAULT 1,
    times_correct   integer NOT NULL DEFAULT 0,
    times_wrong     integer NOT NULL DEFAULT 0,
    first_tested_at timestamptz NOT NULL DEFAULT now(),
    last_tested_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_test_records_student_book_word UNIQUE (student_id, word_book_id, word_id)
);
CREATE INDEX IF NOT EXISTS idx_test_records_student_book ON test_records(student_id, word_book_id);

-- 迁移旧游标数据:游标之前且当前仍"认识"(repetitions > 0)的词视为已测对,避免升级后全部重测;
-- 游标之前但已不认识的词不落记录,重新学会后可以补测。
INSERT INTO test_records (student_id, word_book_id, word_id, last_result, times_tested, times_correct)
SELECT tp.student_id, tp.word_book_id, e.word_id, 'correct', 1, 1
FROM test_progress tp
JOIN word_book_entries e
  ON e.word_book_id = tp.word_book_id
 AND e.order_index <= tp.cursor_order_index
JOIN learning_records lr
  ON lr.student_id = tp.student_id
 AND lr.word_id = e.word_id
 AND lr.repetitions > 0
ON CONFLICT ON CONSTRAINT uq_test_records_student_book_word DO NOTHING;

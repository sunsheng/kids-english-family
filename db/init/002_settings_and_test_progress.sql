-- 用户设置:学员教材版本偏好(空串表示不限版本)
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS preferred_publisher varchar(50) NOT NULL DEFAULT '';

-- 拼写测试进度:与学习进度完全隔离,按 学员 x 词书(=学段+学期+版本)独立推进
CREATE TABLE IF NOT EXISTS test_progress (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    word_book_id        uuid NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
    cursor_order_index  integer NOT NULL DEFAULT 0,
    stage_size          smallint NOT NULL DEFAULT 10,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_test_progress_student_book UNIQUE (student_id, word_book_id)
);

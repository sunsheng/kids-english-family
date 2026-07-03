CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           varchar(255) UNIQUE,
    phone           varchar(20) UNIQUE,
    password_hash   varchar(255) NOT NULL,
    nickname        varchar(50),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TYPE school_stage AS ENUM ('primary', 'junior', 'senior');
CREATE TYPE accent_preference AS ENUM ('us', 'uk');

CREATE TABLE students (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                varchar(50) NOT NULL,
    avatar_url          varchar(255),
    school_stage        school_stage NOT NULL,
    grade_label         varchar(20) NOT NULL,
    sort_order          smallint NOT NULL DEFAULT 0,
    preferred_accent    accent_preference NOT NULL DEFAULT 'us',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);
CREATE INDEX idx_students_user ON students(user_id) WHERE deleted_at IS NULL;

CREATE TYPE word_book_category AS ENUM ('textbook', 'exam_syllabus');

CREATE TABLE word_books (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            varchar(100) NOT NULL,
    category        word_book_category NOT NULL,
    stage           school_stage NOT NULL,
    publisher       varchar(50),
    cover_image_url varchar(255),
    description     text,
    total_words     integer NOT NULL DEFAULT 0,
    is_published    boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE word_book_units (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    word_book_id    uuid NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
    unit_name       varchar(100) NOT NULL,
    order_index     smallint NOT NULL
);
CREATE UNIQUE INDEX idx_units_book_order ON word_book_units(word_book_id, order_index);

CREATE TABLE words (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    spelling        varchar(100) NOT NULL,
    phonetic_us     varchar(100),
    phonetic_uk     varchar(100),
    audio_us_url    varchar(255),
    audio_uk_url    varchar(255),
    definitions     jsonb NOT NULL,
    example_sentence      text,
    example_translation   text,
    difficulty_tag  varchar(20),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_words_spelling ON words(lower(spelling));

CREATE TABLE word_book_entries (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    word_book_id    uuid NOT NULL REFERENCES word_books(id) ON DELETE CASCADE,
    unit_id         uuid REFERENCES word_book_units(id) ON DELETE SET NULL,
    word_id         uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    order_index     integer NOT NULL
);
CREATE UNIQUE INDEX idx_entries_book_word ON word_book_entries(word_book_id, word_id);
CREATE INDEX idx_entries_book_order ON word_book_entries(word_book_id, order_index);

CREATE TYPE study_plan_status AS ENUM ('not_started', 'in_progress', 'completed', 'paused');

CREATE TABLE study_plans (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id           uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    word_book_id         uuid NOT NULL REFERENCES word_books(id),
    daily_new_word_count smallint NOT NULL DEFAULT 10 CHECK (daily_new_word_count IN (10, 20, 30)),
    status               study_plan_status NOT NULL DEFAULT 'not_started',
    cursor_order_index   integer NOT NULL DEFAULT 0,
    started_at           timestamptz,
    completed_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_plans_active_unique ON study_plans(student_id, word_book_id)
    WHERE status IN ('not_started', 'in_progress', 'paused');

CREATE TYPE learning_status AS ENUM ('new', 'learning', 'reviewing', 'mastered');

CREATE TABLE learning_records (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    word_id             uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    study_plan_id       uuid REFERENCES study_plans(id) ON DELETE SET NULL,
    status              learning_status NOT NULL DEFAULT 'new',
    is_in_vocab_book    boolean NOT NULL DEFAULT false,
    ease_factor         real NOT NULL DEFAULT 2.5,
    interval_days       integer NOT NULL DEFAULT 0,
    repetitions         integer NOT NULL DEFAULT 0,
    next_review_at      date,
    times_seen          integer NOT NULL DEFAULT 0,
    times_correct       integer NOT NULL DEFAULT 0,
    times_wrong         integer NOT NULL DEFAULT 0,
    first_learned_at    timestamptz,
    last_reviewed_at    timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_records_student_word ON learning_records(student_id, word_id);
CREATE INDEX idx_records_review_queue ON learning_records(student_id, next_review_at)
    WHERE next_review_at IS NOT NULL;
CREATE INDEX idx_records_vocab_book ON learning_records(student_id) WHERE is_in_vocab_book = true;

CREATE TABLE daily_study_logs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    study_date          date NOT NULL,
    new_words_count     integer NOT NULL DEFAULT 0,
    review_words_count  integer NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_logs_student_date ON daily_study_logs(student_id, study_date);

CREATE TABLE student_stats (
    student_id            uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    total_words_mastered  integer NOT NULL DEFAULT 0,
    current_streak_days   integer NOT NULL DEFAULT 0,
    longest_streak_days   integer NOT NULL DEFAULT 0,
    last_study_date       date,
    updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (id, email, password_hash, nickname)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'demo@example.com',
    'pbkdf2$100000$phase2-demo-salt$9f58585f3d51bc27257905ba406d41e5ab4276b111bf3dd00d57db3ff9a5c1e7449be9ec4d07ab8e37284ba0924ea012b4d560b352d894a99e076930fd7fc4c2',
    'Demo 家长'
)
ON CONFLICT DO NOTHING;

-- 一个账号对应一名学员(学习档案)
INSERT INTO students (id, user_id, name, school_stage, grade_label, sort_order, preferred_accent)
VALUES
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '小明', 'primary', '五年级', 0, 'us')
ON CONFLICT DO NOTHING;

INSERT INTO word_books (id, name, category, stage, publisher, description, total_words)
VALUES
    ('20000000-0000-0000-0000-000000000001', '人教版五年级上册', 'textbook', 'primary', '人教版', '小学五年级上册同步核心词。', 6),
    ('20000000-0000-0000-0000-000000000002', '外研版七年级上册', 'textbook', 'junior', '外研版', '初一上册同步入门词汇。', 3),
    ('20000000-0000-0000-0000-000000000003', '小学核心词', 'exam_syllabus', 'primary', '核心词', '小学阶段高频基础词。', 3),
    ('20000000-0000-0000-0000-000000000004', '中考 1600 词', 'exam_syllabus', 'junior', '中考', '中考高频词汇样例。', 2)
ON CONFLICT DO NOTHING;

INSERT INTO word_book_units (id, word_book_id, unit_name, order_index)
VALUES
    ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Unit 1 My Day', 1),
    ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Unit 2 My Week', 2),
    ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Module 1 Family', 1)
ON CONFLICT DO NOTHING;

INSERT INTO words (
    id,
    spelling,
    phonetic_us,
    phonetic_uk,
    definitions,
    example_sentence,
    example_translation,
    difficulty_tag
)
VALUES
    ('30000000-0000-0000-0000-000000000001', 'breakfast', '/ˈbrekfəst/', '/ˈbrekfəst/', '[{"pos":"n.","meaning":"早餐"}]', 'I have breakfast at seven.', '我七点吃早餐。', 'core'),
    ('30000000-0000-0000-0000-000000000002', 'usually', '/ˈjuːʒuəli/', '/ˈjuːʒuəli/', '[{"pos":"adv.","meaning":"通常地"}]', 'I usually read after dinner.', '我通常晚饭后阅读。', 'core'),
    ('30000000-0000-0000-0000-000000000003', 'exercise', '/ˈeksərsaɪz/', '/ˈeksəsaɪz/', '[{"pos":"n.","meaning":"运动；练习"},{"pos":"v.","meaning":"锻炼"}]', 'We exercise in the park.', '我们在公园锻炼。', 'core'),
    ('30000000-0000-0000-0000-000000000004', 'weekend', '/ˈwiːkend/', '/ˌwiːkˈend/', '[{"pos":"n.","meaning":"周末"}]', 'The weekend is coming.', '周末快到了。', 'core'),
    ('30000000-0000-0000-0000-000000000005', 'family', '/ˈfæməli/', '/ˈfæməli/', '[{"pos":"n.","meaning":"家庭；家人"}]', 'My family is happy.', '我的家人很快乐。', 'core'),
    ('30000000-0000-0000-0000-000000000006', 'parent', '/ˈperənt/', '/ˈpeərənt/', '[{"pos":"n.","meaning":"父亲或母亲"}]', 'Every parent cares about their child.', '每位父母都关心孩子。', 'core'),
    ('30000000-0000-0000-0000-000000000007', 'daughter', '/ˈdɔːtər/', '/ˈdɔːtə/', '[{"pos":"n.","meaning":"女儿"}]', 'Their daughter likes English.', '他们的女儿喜欢英语。', 'core'),
    ('30000000-0000-0000-0000-000000000008', 'science', '/ˈsaɪəns/', '/ˈsaɪəns/', '[{"pos":"n.","meaning":"科学"}]', 'Science is interesting.', '科学很有趣。', 'core')
ON CONFLICT DO NOTHING;

INSERT INTO word_book_entries (id, word_book_id, unit_id, word_id, order_index)
VALUES
    ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1),
    ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 2),
    ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 3),
    ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000004', 4),
    ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', 5),
    ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000008', 6),
    ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000005', 1),
    ('40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000006', 2),
    ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000007', 3),
    ('40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000003', NULL, '30000000-0000-0000-0000-000000000001', 1),
    ('40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000003', NULL, '30000000-0000-0000-0000-000000000002', 2),
    ('40000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000003', NULL, '30000000-0000-0000-0000-000000000005', 3),
    ('40000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000004', NULL, '30000000-0000-0000-0000-000000000003', 1),
    ('40000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000004', NULL, '30000000-0000-0000-0000-000000000008', 2)
ON CONFLICT DO NOTHING;

INSERT INTO study_plans (id, student_id, word_book_id, daily_new_word_count, status, started_at)
VALUES (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    20,
    'in_progress',
    now()
)
ON CONFLICT DO NOTHING;

INSERT INTO student_stats (student_id)
VALUES
    ('10000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

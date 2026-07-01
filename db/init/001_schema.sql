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

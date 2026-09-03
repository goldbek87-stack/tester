-- ============================================
-- TEST PLATFORM — DATABASE SCHEMA (Bosqich 1)
-- ============================================

-- 1) SAVOLLAR BAZASI (50 000 tagacha shu yerga tushadi)
CREATE TABLE IF NOT EXISTS questions (
    id              SERIAL PRIMARY KEY,
    grade           SMALLINT NOT NULL,              -- sinf: 1-11
    subject         VARCHAR(100) NOT NULL,           -- fan: Matematika, Fizika...
    topic           VARCHAR(200) NOT NULL,           -- mavzu: Kasrlar, Kvadrat tenglamalar
    question        TEXT NOT NULL,
    option_a        TEXT NOT NULL,
    option_b        TEXT NOT NULL,
    option_c        TEXT NOT NULL,
    option_d        TEXT NOT NULL,
    correct_answer  CHAR(1) CHECK (correct_answer IN ('A','B','C','D')), -- NULL bo'lishi mumkin: import paytida javob topilmagan bo'lsa
    question_image  TEXT, -- savol matni rasm sifatida (formula/belgilar noto'g'ri o'qilganda ishlatiladi)
    difficulty      VARCHAR(10) NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
    source_book     VARCHAR(255),
    source_page     INTEGER,
    status          VARCHAR(20) NOT NULL DEFAULT 'approved'
                        CHECK (status IN ('approved','review','ocr_error')),
    times_shown     INTEGER NOT NULL DEFAULT 0,      -- statistikaga: nechta o'quvchiga ko'rsatildi
    times_correct   INTEGER NOT NULL DEFAULT 0,      -- nechta o'quvchi to'g'ri topdi
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_filter
    ON questions (grade, subject, topic, difficulty, status);

-- 2) O'QITUVCHILAR (keyinroq auth qo'shiladi, hozircha oddiy)
CREATE TABLE IF NOT EXISTS teachers (
    id          SERIAL PRIMARY KEY,
    full_name   VARCHAR(150) NOT NULL,
    login       VARCHAR(100) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) YARATILGAN TESTLAR (har birining o'zining test_code'i bor)
CREATE TABLE IF NOT EXISTS tests (
    id              SERIAL PRIMARY KEY,
    test_code       VARCHAR(6) UNIQUE NOT NULL,      -- masalan "847291"
    teacher_id      INTEGER REFERENCES teachers(id),
    grade           SMALLINT NOT NULL,
    subject         VARCHAR(100) NOT NULL,
    topic           VARCHAR(200) NOT NULL,
    total_questions SMALLINT NOT NULL,
    easy_count      SMALLINT NOT NULL DEFAULT 0,
    medium_count    SMALLINT NOT NULL DEFAULT 0,
    hard_count      SMALLINT NOT NULL DEFAULT 0,
    duration_min    SMALLINT NOT NULL,               -- test vaqti (daqiqa)
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) TANLANGAN SAVOLLAR (har bir test qaysi savollardan tuzilgani)
CREATE TABLE IF NOT EXISTS test_questions (
    id              SERIAL PRIMARY KEY,
    test_id         INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES questions(id),
    position        SMALLINT NOT NULL                -- aralashtirilgan tartib raqami
);

-- 5) O'QUVCHI URINISHLARI (bitta o'quvchi bitta testni bir marta ishlaydi)
CREATE TABLE IF NOT EXISTS attempts (
    id              SERIAL PRIMARY KEY,
    test_id         INTEGER NOT NULL REFERENCES tests(id),
    student_name    VARCHAR(150) NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    correct_count   SMALLINT,
    wrong_count     SMALLINT,
    score_percent   NUMERIC(5,2),
    duration_sec    INTEGER
);

-- 6) O'QUVCHI JAVOBLARI (har bir savolga bergan javobi — statistika uchun)
CREATE TABLE IF NOT EXISTS attempt_answers (
    id              SERIAL PRIMARY KEY,
    attempt_id      INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id     INTEGER NOT NULL REFERENCES questions(id),
    selected_answer CHAR(1) CHECK (selected_answer IN ('A','B','C','D')),
    is_correct      BOOLEAN
);

"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Home as HomeIcon,
  Keyboard,
  LibraryBig,
  ListChecks,
  LogOut,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createDrillRounds, maskedWord, type DrillRound } from "@/lib/spelling-drill";

type ViewKey = "dashboard" | "library" | "learning" | "test" | "review" | "vocabulary" | "stats";
type SchoolStage = "primary" | "junior" | "senior";
type AccentPreference = "us" | "uk";

type User = {
  id: string;
  email: string;
  nickname: string | null;
};

type Student = {
  id: string;
  user_id: string;
  name: string;
  school_stage: SchoolStage;
  grade_label: string;
  preferred_accent: AccentPreference;
  sort_order: number;
};

type WordBook = {
  id: string;
  name: string;
  category: "textbook" | "exam_syllabus";
  stage: SchoolStage;
  publisher: string | null;
  description: string | null;
  total_words: number;
  learned_count: number;
  active_plan_id: string | null;
  plan_status: "not_started" | "in_progress" | "completed" | "paused" | null;
  daily_new_word_count: number | null;
};

type LearningWord = {
  study_plan_id: string;
  word_book_name: string;
  total_words: number;
  cursor_order_index: number;
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

type ReviewWord = {
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

type VocabularyWord = {
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

type DashboardData = {
  summary: {
    total_words_mastered: number;
    current_streak_days: number;
    longest_streak_days: number;
    today_new_words: number;
    today_review_words: number;
    review_due_count: number;
    vocab_book_count: number;
  };
  heatmap: {
    study_date: string;
    new_words_count: number;
    review_words_count: number;
  }[];
};

type StudentFormState = {
  id?: string;
  name: string;
  schoolStage: SchoolStage;
  gradeLabel: string;
  preferredAccent: AccentPreference;
};

const navItems = [
  { key: "dashboard", label: "仪表盘", icon: HomeIcon },
  { key: "library", label: "选词库", icon: LibraryBig },
  { key: "learning", label: "开始学习", icon: Play },
  { key: "test", label: "开始测试", icon: Keyboard },
  { key: "review", label: "复习中心", icon: RotateCcw },
  { key: "vocabulary", label: "生词本", icon: ListChecks },
  { key: "stats", label: "统计", icon: BarChart3 },
];

const DEFAULT_DAILY_NEW_WORD_COUNT = 20;

const stageLabels: Record<SchoolStage, string> = {
  primary: "小学",
  junior: "初中",
  senior: "高中",
};

const defaultStudentForm: StudentFormState = {
  name: "",
  schoolStage: "primary",
  gradeLabel: "五年级",
  preferredAccent: "us",
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "请求失败。");
  }

  return data;
}

function initials(name: string) {
  return name.slice(-1);
}

function playAudioUrl(audioUrl: string | null) {
  if (!audioUrl) {
    return;
  }

  const audio = new Audio(audioUrl);
  void audio.play().catch(() => undefined);
}

const autoPlayHistory = new Map<string, number>();

function playAutoAudioUrl(audioUrl: string | null, key: string) {
  if (!audioUrl) {
    return;
  }

  const now = Date.now();
  const lastPlayedAt = autoPlayHistory.get(key) ?? 0;

  if (now - lastPlayedAt < 1200) {
    return;
  }

  autoPlayHistory.set(key, now);
  playAudioUrl(audioUrl);
}

function createHeatmapLevels(days: DashboardData["heatmap"]) {
  const levels = Array(14).fill(0) as number[];
  const today = new Date();

  days.forEach((day) => {
    const date = new Date(day.study_date);
    const diff = Math.round((today.getTime() - date.getTime()) / 86400000);
    const index = 13 - diff;
    const count = day.new_words_count + day.review_words_count;

    if (index >= 0 && index < levels.length) {
      levels[index] = Math.min(4, count);
    }
  });

  return levels;
}

function getWordAudio(word: LearningWord | ReviewWord, student: Student | null) {
  if (!student) {
    return null;
  }

  return student.preferred_accent === "uk" ? word.audio_uk_url : word.audio_us_url;
}

function getWordPhonetic(word: LearningWord | ReviewWord, student: Student | null) {
  if (!student) {
    return null;
  }

  return student.preferred_accent === "uk" ? word.phonetic_uk : word.phonetic_us;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState("demo@example.com");
  const [loginPassword, setLoginPassword] = useState("demo123456");
  const [loginError, setLoginError] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [activeStudentId, setActiveStudentId] = useState("");
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [reviewWords, setReviewWords] = useState<ReviewWord[]>([]);
  const [vocabularyWords, setVocabularyWords] = useState<VocabularyWord[]>([]);
  const [vocabularyKeyword, setVocabularyKeyword] = useState("");
  const [studentForm, setStudentForm] = useState<StudentFormState | null>(null);
  const [learningWord, setLearningWord] = useState<LearningWord | null>(null);
  const [reviewTestWord, setReviewTestWord] = useState<ReviewWord | null>(null);
  const [learningMessage, setLearningMessage] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [remotePhonetic, setRemotePhonetic] = useState<string | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isSubmittingRecord, setIsSubmittingRecord] = useState(false);
  const [appError, setAppError] = useState("");

  const activeStudent = students.find((student) => student.id === activeStudentId) ?? null;
  const activePlanBook = wordBooks.find((book) => book.plan_status === "in_progress");
  const todayTarget = activePlanBook?.daily_new_word_count ?? 0;
  const todayDone = dashboardData?.summary.today_new_words ?? 0;

  const loadDashboard = useCallback(async (studentId: string) => {
    const data = await readJson<DashboardData>(
      await fetch(`/api/dashboard?studentId=${studentId}`),
    );
    setDashboardData(data);
  }, []);

  const loadWordBooks = useCallback(async (studentId: string) => {
    const data = await readJson<{ wordBooks: WordBook[] }>(
      await fetch(`/api/word-books?studentId=${studentId}`),
    );
    setWordBooks(data.wordBooks);
  }, []);

  const loadReviews = useCallback(async (studentId: string) => {
    const data = await readJson<{ reviews: ReviewWord[] }>(
      await fetch(`/api/learning/reviews?studentId=${studentId}`),
    );
    setReviewWords(data.reviews);
  }, []);

  const loadVocabulary = useCallback(
    async (studentId: string, keyword = vocabularyKeyword) => {
      const data = await readJson<{ words: VocabularyWord[] }>(
        await fetch(
          `/api/vocabulary?studentId=${studentId}&keyword=${encodeURIComponent(keyword)}`,
        ),
      );
      setVocabularyWords(data.words);
    },
    [vocabularyKeyword],
  );

  const loadStudents = useCallback(
    async (userId: string, preferredStudentId?: string) => {
      const data = await readJson<{ students: Student[] }>(
        await fetch(`/api/students?userId=${userId}`),
      );
      const nextStudentId =
        data.students.find((student) => student.id === preferredStudentId)?.id ??
        data.students[0]?.id ??
        "";

      setStudents(data.students);
      setActiveStudentId(nextStudentId);

      if (nextStudentId) {
        await Promise.all([loadWordBooks(nextStudentId), loadDashboard(nextStudentId)]);
      }
    },
    [loadDashboard, loadWordBooks],
  );

  const loadNextWord = useCallback(async (student: Student) => {
    const data = await readJson<{ word: LearningWord | null }>(
      await fetch(`/api/learning/next?studentId=${student.id}`),
    );
    setLearningWord(data.word);
    setLearningMessage(data.word ? "" : "当前学习计划已经完成，或还没有选择词书。");
    setIsCardFlipped(false);

    if (!data.word) {
      setAudioUrl(null);
      setRemotePhonetic(null);
      return;
    }

    const localAudio =
      student.preferred_accent === "uk" ? data.word.audio_uk_url : data.word.audio_us_url;
    const localPhonetic =
      student.preferred_accent === "uk" ? data.word.phonetic_uk : data.word.phonetic_us;

    setAudioUrl(localAudio);
    setRemotePhonetic(localPhonetic);

    await fetch(
      `/api/words/${encodeURIComponent(data.word.spelling)}?accent=${student.preferred_accent}`,
    )
      .then((response) => readJson<{ phonetic: string | null; audioUrl: string | null }>(response))
      .then((data) => {
        const nextAudioUrl = data.audioUrl ?? localAudio;
        setAudioUrl(nextAudioUrl);
        setRemotePhonetic(data.phonetic ?? localPhonetic);
      })
      .catch(() => undefined);
  }, []);

  const submitLearningRecord = useCallback(
    async (result: "known" | "unknown" | "correct" | "wrong") => {
      if (!activeStudent || !learningWord || isSubmittingRecord) {
        return;
      }

      setIsSubmittingRecord(true);
      setLearningMessage("");

      try {
        await readJson(
          await fetch("/api/learning/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: activeStudent.id,
              wordId: learningWord.word_id,
              studyPlanId: learningWord.study_plan_id,
              entryOrderIndex: learningWord.entry_order_index,
              result,
            }),
          }),
        );
        await Promise.all([loadWordBooks(activeStudent.id), loadDashboard(activeStudent.id)]);
        await loadNextWord(activeStudent);
      } catch (error) {
        setLearningMessage(error instanceof Error ? error.message : "保存学习记录失败。");
      } finally {
        setIsSubmittingRecord(false);
      }
    },
    [activeStudent, isSubmittingRecord, learningWord, loadDashboard, loadNextWord, loadWordBooks],
  );

  const submitReviewRecord = useCallback(
    async (word: ReviewWord, result: "correct" | "wrong") => {
      if (!activeStudent || isSubmittingRecord) {
        return;
      }

      setIsSubmittingRecord(true);

      try {
        await readJson(
          await fetch("/api/learning/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: activeStudent.id,
              wordId: word.word_id,
              result,
              mode: "review",
            }),
          }),
        );
        await Promise.all([
          loadReviews(activeStudent.id),
          loadDashboard(activeStudent.id),
          loadVocabulary(activeStudent.id),
        ]);
      } catch (error) {
        setAppError(error instanceof Error ? error.message : "保存复习记录失败。");
      } finally {
        setIsSubmittingRecord(false);
      }
    },
    [activeStudent, isSubmittingRecord, loadDashboard, loadReviews, loadVocabulary],
  );

  const submitTestRecord = useCallback(
    async (result: "correct" | "wrong") => {
      if (reviewTestWord) {
        await submitReviewRecord(reviewTestWord, result);
        setReviewTestWord(null);
        setActiveView("review");
        return;
      }

      await submitLearningRecord(result);
    },
    [reviewTestWord, submitLearningRecord, submitReviewRecord],
  );

  useEffect(() => {
    if (activeView !== "learning") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "r" || event.key === "R") {
        playAudioUrl(audioUrl);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        playAudioUrl(audioUrl);
      }

      if (event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        setIsCardFlipped((current) => !current);
      }

      if (event.key === "ArrowLeft") {
        void submitLearningRecord("unknown");
      }

      if (event.key === "ArrowRight") {
        void submitLearningRecord("known");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeView, audioUrl, submitLearningRecord]);

  const dashboardStats = useMemo(
    () => [
      { label: "连续打卡", value: `${dashboardData?.summary.current_streak_days ?? 0} 天` },
      {
        label: "累计词汇",
        value: String(dashboardData?.summary.total_words_mastered ?? 0),
      },
      { label: "今日已学", value: String(todayDone) },
    ],
    [dashboardData, todayDone],
  );

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");

    try {
      const data = await readJson<{ user: User }>(
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        }),
      );
      setUser(data.user);
      await loadStudents(data.user.id);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败。");
    }
  }

  async function saveStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !studentForm) {
      return;
    }

    const isEditing = Boolean(studentForm.id);
    const response = await fetch(isEditing ? `/api/students/${studentForm.id}` : "/api/students", {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        name: studentForm.name,
        schoolStage: studentForm.schoolStage,
        gradeLabel: studentForm.gradeLabel,
        preferredAccent: studentForm.preferredAccent,
      }),
    });

    try {
      const data = await readJson<{ student: Student }>(response);
      await loadStudents(user.id, data.student.id);
      setStudentForm(null);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "保存学员失败。");
    }
  }

  async function deleteStudent(studentId: string) {
    if (!user || students.length <= 1) {
      setAppError("至少保留一名学员。");
      return;
    }

    try {
      await readJson(await fetch(`/api/students/${studentId}`, { method: "DELETE" }));
      await loadStudents(user.id);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "删除学员失败。");
    }
  }

  async function startBook(book: WordBook) {
    if (!activeStudent) {
      return;
    }

    try {
      await readJson(
        await fetch("/api/study-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: activeStudent.id,
            wordBookId: book.id,
            dailyNewWordCount: DEFAULT_DAILY_NEW_WORD_COUNT,
          }),
        }),
      );
      await loadWordBooks(activeStudent.id);
      setActiveView("learning");
      await loadNextWord(activeStudent);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "开启计划失败。");
    }
  }

  async function switchStudent(student: Student) {
    setActiveStudentId(student.id);
    setReviewTestWord(null);
    await Promise.all([loadWordBooks(student.id), loadDashboard(student.id)]);

    if (activeView === "learning" || activeView === "test") {
      await loadNextWord(student);
    }

    if (activeView === "review") {
      await loadReviews(student.id);
    }

    if (activeView === "vocabulary") {
      await loadVocabulary(student.id);
    }
  }

  async function openView(view: ViewKey) {
    setActiveView(view);

    if (view !== "test") {
      setReviewTestWord(null);
    }

    if ((view === "learning" || view === "test") && activeStudent) {
      await loadNextWord(activeStudent);
    }

    if (view === "dashboard" && activeStudent) {
      await loadDashboard(activeStudent.id);
    }

    if ((view === "review" || view === "stats") && activeStudent) {
      await Promise.all([loadReviews(activeStudent.id), loadDashboard(activeStudent.id)]);
    }

    if (view === "vocabulary" && activeStudent) {
      await loadVocabulary(activeStudent.id);
    }
  }

  async function startReviewTest(word: ReviewWord) {
    setReviewTestWord(word);
    setActiveView("test");
  }

  if (!user) {
    return (
      <main className="login-page">
        <form className="login-panel" onSubmit={handleLogin}>
          <p className="eyebrow">少儿英语·家庭版</p>
          <h1>家长登录</h1>
          <label>
            邮箱
            <input
              onChange={(event) => setLoginEmail(event.target.value)}
              type="email"
              value={loginEmail}
            />
          </label>
          <label>
            密码
            <input
              onChange={(event) => setLoginPassword(event.target.value)}
              type="password"
              value={loginPassword}
            />
          </label>
          {loginError ? <p className="form-error">{loginError}</p> : null}
          <button className="confirm-button" type="submit">
            <LogOut aria-hidden="true" size={22} />
            登录
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">少儿英语·家庭版</p>
          <h1>当前学员：{activeStudent?.name ?? "未选择"}</h1>
        </div>
        <div className="topbar-actions" aria-label="学习状态">
          <span>
            今日进度：{todayDone}/{todayTarget}
          </span>
          <button
            aria-label="退出"
            onClick={() => {
              setUser(null);
              setStudents([]);
              setWordBooks([]);
              setActiveStudentId("");
            }}
            type="button"
          >
            <LogOut aria-hidden="true" size={18} />
            退出
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="主导航">
          <section className="student-section" aria-labelledby="students-title">
            <div className="student-title-row">
              <h2 id="students-title">家庭学员</h2>
              <button
                aria-label="新增学员"
                className="icon-action"
                onClick={() => setStudentForm(defaultStudentForm)}
                type="button"
              >
                <Plus aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="student-list">
              {students.map((student) => (
                <div className="student-card-row" key={student.id}>
                  <button
                    className={
                      student.id === activeStudentId ? "student-card active" : "student-card"
                    }
                    onClick={() => void switchStudent(student)}
                    type="button"
                  >
                    <span className="avatar" aria-hidden="true">
                      {initials(student.name)}
                    </span>
                    <span>
                      <strong>{student.name}</strong>
                      <small>
                        {stageLabels[student.school_stage]}
                        {student.grade_label} ·{" "}
                        {student.preferred_accent === "us" ? "美音" : "英音"}
                      </small>
                    </span>
                  </button>
                  <div className="student-actions">
                    <button
                      aria-label={`编辑 ${student.name}`}
                      className="icon-action"
                      onClick={() =>
                        setStudentForm({
                          id: student.id,
                          name: student.name,
                          schoolStage: student.school_stage,
                          gradeLabel: student.grade_label,
                          preferredAccent: student.preferred_accent,
                        })
                      }
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={16} />
                    </button>
                    <button
                      aria-label={`删除 ${student.name}`}
                      className="icon-action danger"
                      onClick={() => void deleteStudent(student.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <nav className="nav-list" aria-label="功能导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              const enabled = true;
              const active = item.key === activeView;

              return (
                <button
                  aria-current={active ? "page" : undefined}
                  aria-disabled={!enabled}
                  className={`nav-link ${active ? "active" : ""} ${enabled ? "" : "disabled"}`}
                  key={item.key}
                  onClick={() => {
                    if (enabled) {
                      void openView(item.key as ViewKey);
                    }
                  }}
                  type="button"
                >
                  <Icon aria-hidden="true" size={20} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="content">
          {appError ? (
            <div className="inline-alert">
              <span>{appError}</span>
              <button onClick={() => setAppError("")} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          ) : null}
          {activeView === "dashboard" ? (
            <Dashboard
              activeBook={activePlanBook}
              dashboardData={dashboardData}
              dashboardStats={dashboardStats}
              onOpenLearning={() => void openView("learning")}
              onOpenLibrary={() => void openView("library")}
              onOpenReview={() => void openView("review")}
            />
          ) : null}
          {activeView === "library" ? (
            <Library onStartBook={(book) => void startBook(book)} wordBooks={wordBooks} />
          ) : null}
          {activeView === "learning" ? (
            <LearningRoom
              activeStudent={activeStudent}
              audioUrl={audioUrl}
              isCardFlipped={isCardFlipped}
              isSubmitting={isSubmittingRecord}
              learningMessage={learningMessage}
              onFlip={() => setIsCardFlipped((current) => !current)}
              onReplay={() => playAudioUrl(audioUrl)}
              onSubmit={(result) => void submitLearningRecord(result)}
              phonetic={remotePhonetic}
              word={learningWord}
            />
          ) : null}
          {activeView === "test" ? (
            <TestRoom
              activeStudent={activeStudent}
              audioUrl={
                reviewTestWord
                  ? getWordAudio(reviewTestWord, activeStudent)
                  : learningWord
                    ? audioUrl
                    : null
              }
              isSubmitting={isSubmittingRecord}
              message={learningMessage}
              onComplete={(result) => void submitTestRecord(result)}
              onReplay={() =>
                playAudioUrl(
                  reviewTestWord
                    ? getWordAudio(reviewTestWord, activeStudent)
                    : learningWord
                      ? audioUrl
                      : null,
                )
              }
              phonetic={
                reviewTestWord
                  ? getWordPhonetic(reviewTestWord, activeStudent)
                  : learningWord
                    ? remotePhonetic
                    : null
              }
              reviewWord={reviewTestWord}
              word={learningWord}
            />
          ) : null}
          {activeView === "review" ? (
            <ReviewCenter
              onStartTest={(word) => void startReviewTest(word)}
              reviews={reviewWords}
            />
          ) : null}
          {activeView === "vocabulary" ? (
            <VocabularyBook
              keyword={vocabularyKeyword}
              onKeywordChange={(keyword) => {
                setVocabularyKeyword(keyword);
                if (activeStudent) {
                  void loadVocabulary(activeStudent.id, keyword);
                }
              }}
              words={vocabularyWords}
            />
          ) : null}
          {activeView === "stats" ? (
            <StatsPanel dashboardData={dashboardData} wordBooks={wordBooks} />
          ) : null}
        </main>
      </div>

      {studentForm ? (
        <StudentDialog
          form={studentForm}
          onChange={setStudentForm}
          onClose={() => setStudentForm(null)}
          onSubmit={(event) => void saveStudent(event)}
        />
      ) : null}
    </div>
  );
}

function Dashboard({
  activeBook,
  dashboardData,
  dashboardStats,
  onOpenLearning,
  onOpenLibrary,
  onOpenReview,
}: {
  activeBook?: WordBook;
  dashboardData: DashboardData | null;
  dashboardStats: { label: string; value: string }[];
  onOpenLearning: () => void;
  onOpenLibrary: () => void;
  onOpenReview: () => void;
}) {
  const progressPercent = activeBook
    ? Math.round(
        ((dashboardData?.summary.today_new_words ?? 0) /
          Math.max(activeBook.daily_new_word_count ?? 1, 1)) *
          100,
      )
    : 0;
  const heatmapDays = createHeatmapLevels(dashboardData?.heatmap ?? []);
  const reviewDueCount = dashboardData?.summary.review_due_count ?? 0;

  return (
    <>
      <section className="page-heading" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">仪表盘</h2>
          <p>{activeBook ? `正在学习 ${activeBook.name}。` : "先选择一本词书开启学习计划。"}</p>
        </div>
        <button className="primary-action" onClick={onOpenLibrary} type="button">
          <BookOpen aria-hidden="true" size={22} />
          选择词库
        </button>
      </section>

      <section className="dashboard-grid" aria-label="学习概览">
        <article className="today-card">
          <div className="section-title">
            <CalendarDays aria-hidden="true" size={22} />
            <h3>今日任务</h3>
          </div>
          <div className="task-row">
            <span>{activeBook?.name ?? "暂无计划"}</span>
            <strong>
              {dashboardData?.summary.today_new_words ?? 0}/{activeBook?.daily_new_word_count ?? 0}
            </strong>
          </div>
          <div className="progress-bar" aria-label="今日进度">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <button className="start-button" onClick={onOpenLearning} type="button">
            <Play aria-hidden="true" size={22} />
            开始学习
          </button>
        </article>

        <article className="review-card">
          <div className="section-title">
            <RotateCcw aria-hidden="true" size={22} />
            <h3>复习任务</h3>
          </div>
          <div className="review-count">{reviewDueCount}</div>
          <p>今日到期复习词会按简化 SM-2 自动进入队列。</p>
          <button className="start-button" onClick={onOpenReview} type="button">
            <RotateCcw aria-hidden="true" size={22} />
            去复习
          </button>
        </article>

        <div className="stat-strip" aria-label="学习统计">
          {dashboardStats.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>

        <article className="calendar-card">
          <div className="section-title">
            <CalendarDays aria-hidden="true" size={22} />
            <h3>学习日历</h3>
          </div>
          <div className="heatmap" aria-label="最近 14 天学习热力图">
            {heatmapDays.map((level, index) => (
              <span data-level={level} key={`${level}-${index}`} />
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

function Library({
  onStartBook,
  wordBooks,
}: {
  onStartBook: (book: WordBook) => void;
  wordBooks: WordBook[];
}) {
  return (
    <>
      <section className="page-heading" aria-labelledby="library-title">
        <div>
          <p className="eyebrow">Library</p>
          <h2 id="library-title">选词库</h2>
          <p>选择一本词书，直接开始学习。</p>
        </div>
        <div className="search-box">
          <Search aria-hidden="true" size={20} />
          <span>搜索词书</span>
        </div>
      </section>

      <section className="book-grid" aria-label="词库列表">
        {wordBooks.map((book) => {
          const progressPercent = Math.round(
            (book.learned_count / Math.max(book.total_words, 1)) * 100,
          );

          return (
            <article className="book-card" key={book.id}>
              <div className="book-cover">
                <span>{book.publisher ?? "词书"}</span>
              </div>
              <div className="book-body">
                <p>
                  {book.category === "textbook" ? "教材同步" : "考纲词汇"} ·{" "}
                  {stageLabels[book.stage]}
                </p>
                <h3>{book.name}</h3>
                <div className="book-progress">
                  <span>
                    学到 {book.learned_count}/{book.total_words}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="progress-bar" aria-label={`${book.name} 学习进度`}>
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <button className="book-button" onClick={() => onStartBook(book)} type="button">
                  <BookOpen aria-hidden="true" size={20} />
                  {book.active_plan_id ? "继续学习" : "开始学习"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function LearningRoom({
  activeStudent,
  audioUrl,
  isCardFlipped,
  isSubmitting,
  learningMessage,
  onFlip,
  onReplay,
  onSubmit,
  phonetic,
  word,
}: {
  activeStudent: Student | null;
  audioUrl: string | null;
  isCardFlipped: boolean;
  isSubmitting: boolean;
  learningMessage: string;
  onFlip: () => void;
  onReplay: () => void;
  onSubmit: (result: "known" | "unknown" | "correct" | "wrong") => void;
  phonetic: string | null;
  word: LearningWord | null;
}) {
  useEffect(() => {
    if (word) {
      playAutoAudioUrl(audioUrl, `learning-${word.word_id}`);
    }
  }, [audioUrl, word]);

  return (
    <>
      <section className="page-heading" aria-labelledby="learning-title">
        <div>
          <p className="eyebrow">Learning Room</p>
          <h2 id="learning-title">学习室</h2>
          <p>
            {word
              ? `${word.word_book_name} · ${activeStudent?.preferred_accent === "uk" ? "英音" : "美音"}`
              : "暂无可学习单词。"}
          </p>
        </div>
        <button className="primary-action" onClick={onReplay} type="button">
          <Volume2 aria-hidden="true" size={22} />
          重听
        </button>
      </section>

      <section className="learning-panel" aria-label="单词卡片">
        {word ? (
          <>
            <div className="learning-progress">
              <span>
                学到 {word.entry_order_index}/{word.total_words}
              </span>
              <span>↑ 重听 · ↓ 翻卡 · ← 不认识 · → 认识</span>
            </div>
            <button className="word-card" onClick={onFlip} type="button">
              <span className="word-spelling">{word.spelling}</span>
              <span className="word-phonetic">{phonetic ?? "音标加载中"}</span>
              {isCardFlipped ? (
                <span className="word-detail">
                  {word.definitions.map((definition) => (
                    <span key={`${definition.pos ?? ""}-${definition.meaning}`}>
                      {definition.pos ? `${definition.pos} ` : ""}
                      {definition.meaning}
                    </span>
                  ))}
                  {word.example_sentence ? <em>{word.example_sentence}</em> : null}
                  {word.example_translation ? <small>{word.example_translation}</small> : null}
                </span>
              ) : null}
            </button>
            <div className="learning-actions">
              <button
                className="decision-button unknown"
                disabled={isSubmitting}
                onClick={() => onSubmit("unknown")}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={22} />
                不认识
              </button>
              <button
                className="decision-button replay"
                disabled={!audioUrl}
                onClick={onReplay}
                type="button"
              >
                <Volume2 aria-hidden="true" size={22} />
                重新播放
              </button>
              <button
                className="decision-button known"
                disabled={isSubmitting}
                onClick={() => onSubmit("known")}
                type="button"
              >
                认识
                <ArrowRight aria-hidden="true" size={22} />
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>{learningMessage}</p>
          </div>
        )}
      </section>
    </>
  );
}

function TestRoom({
  activeStudent,
  audioUrl,
  isSubmitting,
  message,
  onComplete,
  onReplay,
  phonetic,
  reviewWord,
  word,
}: {
  activeStudent: Student | null;
  audioUrl: string | null;
  isSubmitting: boolean;
  message: string;
  onComplete: (result: "correct" | "wrong") => void;
  onReplay: () => void;
  phonetic: string | null;
  reviewWord: ReviewWord | null;
  word: LearningWord | null;
}) {
  const testWord = reviewWord ?? word;
  const spelling = testWord?.spelling ?? "";

  return (
    <>
      <section className="page-heading" aria-labelledby="test-title">
        <div>
          <p className="eyebrow">Test Room</p>
          <h2 id="test-title">测试</h2>
          <p>
            {testWord
              ? `${reviewWord ? "复习测试" : "新词测试"} · ${activeStudent?.preferred_accent === "uk" ? "英音" : "美音"}`
              : "暂无可测试单词。"}
          </p>
        </div>
        <button className="primary-action" disabled={!audioUrl} onClick={onReplay} type="button">
          <Volume2 aria-hidden="true" size={22} />
          重听
        </button>
      </section>

      <section className="learning-panel" aria-label="拼写测试">
        {testWord ? (
          <>
            <div className="test-summary">
              <div>
                <span className="word-phonetic">{phonetic ?? "音标加载中"}</span>
                <p>听发音，按键盘输入缺失字母。</p>
              </div>
              <span>{reviewWord ? "到期复习" : word?.word_book_name}</span>
            </div>
            <SpellingDrill
              audioUrl={audioUrl}
              disabled={isSubmitting}
              key={`${reviewWord ? "review" : "new"}-${testWord.word_id}`}
              onComplete={onComplete}
              onReplay={onReplay}
              word={spelling}
            />
          </>
        ) : (
          <div className="empty-state">
            <p>{message}</p>
          </div>
        )}
      </section>
    </>
  );
}

function SpellingDrill({
  audioUrl,
  disabled,
  onComplete,
  onReplay,
  word,
}: {
  audioUrl: string | null;
  disabled: boolean;
  onComplete: (result: "correct" | "wrong") => void;
  onReplay: () => void;
  word: string;
}) {
  const rounds = useMemo(() => createDrillRounds(word), [word]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [hadError, setHadError] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const round = rounds[roundIndex] as DrillRound;
  const letters = maskedWord(word.toLowerCase(), round);
  const isComplete = answers.length === round.length && answers.every(Boolean);
  const cells = letters.map((letter, index) => ({
    answer: letter ? "" : (answers[letters.slice(0, index).filter((cell) => !cell).length] ?? ""),
    index,
    letter,
  }));

  useEffect(() => {
    playAutoAudioUrl(audioUrl, `spelling-${word}-${roundIndex}`);
  }, [audioUrl, roundIndex, word]);

  const submitRound = useCallback(() => {
    if (!isComplete || disabled) {
      return;
    }

    const expected = word.toLowerCase().slice(round.start, round.start + round.length);
    const actual = answers.join("").toLowerCase();

    if (actual !== expected) {
      setHadError(true);
      setFeedback("wrong");
      window.setTimeout(() => {
        setAnswers([]);
        setFeedback("idle");
      }, 260);
      return;
    }

    setFeedback("correct");
    window.setTimeout(() => {
      if (roundIndex === rounds.length - 1) {
        onComplete(hadError ? "wrong" : "correct");
        return;
      }

      setRoundIndex((current) => current + 1);
      setAnswers([]);
      setFeedback("idle");
    }, 260);
  }, [answers, disabled, hadError, isComplete, onComplete, round, roundIndex, rounds.length, word]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (disabled) {
        return;
      }

      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        setAnswers((current) => {
          if (current.length >= round.length) {
            return current;
          }

          return [...current, event.key.toLowerCase()];
        });
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setAnswers((current) => current.slice(0, -1));
      }

      if (event.key === "Enter") {
        event.preventDefault();
        submitRound();
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        onReplay();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, onReplay, round.length, submitRound]);

  return (
    <section className={`spelling-drill ${feedback}`} aria-label="拼写三轮巩固">
      <div className="drill-header">
        <div>
          <p className="eyebrow">Spelling Drill</p>
          <h3>第 {round.round} 轮</h3>
        </div>
        <span>{hadError ? "本词已出现错误，将按答错调度复习。" : "三轮零错误才算答对。"}</span>
      </div>
      <div className="letter-grid" aria-label="字母格">
        {cells.map(({ answer, index, letter }) => {
          if (letter) {
            return (
              <span className="letter-cell fixed" key={`${letter}-${index}`}>
                {letter}
              </span>
            );
          }

          return (
            <span className="letter-cell blank" key={`blank-${index}`}>
              {answer}
            </span>
          );
        })}
      </div>
      {round.prompt.length > 0 ? (
        <div className="prompt-row" aria-label="提示块">
          {round.prompt.map((prompt) => (
            <span key={prompt}>{prompt}</span>
          ))}
        </div>
      ) : null}
      <div className="drill-actions">
        <button className="book-button" disabled={disabled} onClick={submitRound} type="button">
          <Check aria-hidden="true" size={20} />
          提交本轮
        </button>
        <button
          className="book-button secondary"
          disabled={!audioUrl}
          onClick={onReplay}
          type="button"
        >
          <Volume2 aria-hidden="true" size={20} />
          重听
        </button>
      </div>
    </section>
  );
}

function ReviewCenter({
  onStartTest,
  reviews,
}: {
  onStartTest: (word: ReviewWord) => void;
  reviews: ReviewWord[];
}) {
  return (
    <>
      <section className="page-heading" aria-labelledby="review-title">
        <div>
          <p className="eyebrow">Review Center</p>
          <h2 id="review-title">复习中心</h2>
          <p>今日到期 {reviews.length} 个词，选择一个进入测试页完成复习。</p>
        </div>
      </section>

      <section className="vocab-list" aria-label="复习队列">
        {reviews.length > 0 ? (
          reviews.map((word) => (
            <article className="vocab-item" key={word.record_id}>
              <div>
                <h3>{word.spelling}</h3>
                <p>{word.definitions.map((definition) => definition.meaning).join("；")}</p>
              </div>
              <div className="vocab-meta">
                <span>连续 {word.repetitions}</span>
                <span>错 {word.times_wrong}</span>
                <button
                  className="book-button compact"
                  onClick={() => onStartTest(word)}
                  type="button"
                >
                  <Keyboard aria-hidden="true" size={18} />
                  开始测试
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <p>今天没有到期复习词。</p>
          </div>
        )}
      </section>
    </>
  );
}

function VocabularyBook({
  keyword,
  onKeywordChange,
  words,
}: {
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  words: VocabularyWord[];
}) {
  return (
    <>
      <section className="page-heading" aria-labelledby="vocabulary-title">
        <div>
          <p className="eyebrow">Vocabulary</p>
          <h2 id="vocabulary-title">生词本</h2>
          <p>所有答错或标记不认识的词会进入这里。</p>
        </div>
        <label className="search-box interactive">
          <Search aria-hidden="true" size={20} />
          <input
            aria-label="搜索生词"
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索生词"
            value={keyword}
          />
        </label>
      </section>

      <section className="vocab-list" aria-label="生词列表">
        {words.length > 0 ? (
          words.map((word) => (
            <article className="vocab-item" key={word.record_id}>
              <div>
                <h3>{word.spelling}</h3>
                <p>{word.definitions.map((definition) => definition.meaning).join("；")}</p>
              </div>
              <div className="vocab-meta">
                <span>错 {word.times_wrong}</span>
                <span>对 {word.times_correct}</span>
                <span>{word.next_review_at ? `下次 ${word.next_review_at}` : "暂无复习"}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <p>暂无生词。</p>
          </div>
        )}
      </section>
    </>
  );
}

function StatsPanel({
  dashboardData,
  wordBooks,
}: {
  dashboardData: DashboardData | null;
  wordBooks: WordBook[];
}) {
  const summary = dashboardData?.summary;

  return (
    <>
      <section className="page-heading" aria-labelledby="stats-title">
        <div>
          <p className="eyebrow">Stats</p>
          <h2 id="stats-title">统计</h2>
          <p>词汇量、复习量和学习日历读取真实学习记录。</p>
        </div>
      </section>

      <section className="stats-grid" aria-label="统计详情">
        <article className="stat-card">
          <span>累计掌握</span>
          <strong>{summary?.total_words_mastered ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>待复习</span>
          <strong>{summary?.review_due_count ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span>生词</span>
          <strong>{summary?.vocab_book_count ?? 0}</strong>
        </article>
        {wordBooks.map((book) => (
          <article className="vocab-item" key={book.id}>
            <div>
              <h3>{book.name}</h3>
              <p>
                {book.learned_count}/{book.total_words}
              </p>
            </div>
            <div className="progress-bar" aria-label={`${book.name} 统计进度`}>
              <span
                style={{
                  width: `${Math.round((book.learned_count / Math.max(book.total_words, 1)) * 100)}%`,
                }}
              />
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function StudentDialog({
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  form: StudentFormState;
  onChange: (form: StudentFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        aria-labelledby="student-dialog-title"
        className="plan-dialog student-dialog"
        onSubmit={onSubmit}
      >
        <button aria-label="关闭" className="dialog-close" onClick={onClose} type="button">
          <X aria-hidden="true" size={22} />
        </button>
        <p className="eyebrow">学员档案</p>
        <h3 id="student-dialog-title">{form.id ? "编辑学员" : "新增学员"}</h3>
        <label>
          姓名
          <input
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            required
            value={form.name}
          />
        </label>
        <label>
          学段
          <select
            onChange={(event) =>
              onChange({ ...form, schoolStage: event.target.value as SchoolStage })
            }
            value={form.schoolStage}
          >
            <option value="primary">小学</option>
            <option value="junior">初中</option>
            <option value="senior">高中</option>
          </select>
        </label>
        <label>
          年级
          <input
            onChange={(event) => onChange({ ...form, gradeLabel: event.target.value })}
            required
            value={form.gradeLabel}
          />
        </label>
        <label>
          发音偏好
          <select
            onChange={(event) =>
              onChange({ ...form, preferredAccent: event.target.value as AccentPreference })
            }
            value={form.preferredAccent}
          >
            <option value="us">美音</option>
            <option value="uk">英音</option>
          </select>
        </label>
        <button className="confirm-button" type="submit">
          <Check aria-hidden="true" size={22} />
          保存
        </button>
      </form>
    </div>
  );
}

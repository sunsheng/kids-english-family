"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Home as HomeIcon,
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

type ViewKey = "dashboard" | "library" | "learning";
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
  mastered_count: number;
  active_plan_id: string | null;
  daily_new_word_count: number | null;
};

type LearningWord = {
  study_plan_id: string;
  word_book_name: string;
  daily_new_word_count: number;
  cursor_order_index: number;
  entry_order_index: number;
  completed_count: number;
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
  { key: "review", label: "复习中心", icon: RotateCcw },
  { key: "vocabulary", label: "生词本", icon: ListChecks },
  { key: "stats", label: "统计", icon: BarChart3 },
];

const dailyWordCounts = [10, 20, 30];

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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState("demo@example.com");
  const [loginPassword, setLoginPassword] = useState("demo123456");
  const [loginError, setLoginError] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [activeStudentId, setActiveStudentId] = useState("");
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<WordBook | null>(null);
  const [dailyCount, setDailyCount] = useState(20);
  const [studentForm, setStudentForm] = useState<StudentFormState | null>(null);
  const [learningWord, setLearningWord] = useState<LearningWord | null>(null);
  const [learningMessage, setLearningMessage] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [remotePhonetic, setRemotePhonetic] = useState<string | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isSubmittingRecord, setIsSubmittingRecord] = useState(false);
  const [appError, setAppError] = useState("");

  const activeStudent = students.find((student) => student.id === activeStudentId) ?? null;
  const activePlanBook = wordBooks.find((book) => book.active_plan_id);
  const todayTarget = activePlanBook?.daily_new_word_count ?? 0;
  const todayDone = activePlanBook?.mastered_count ?? 0;

  const loadWordBooks = useCallback(async (studentId: string) => {
    const data = await readJson<{ wordBooks: WordBook[] }>(
      await fetch(`/api/word-books?studentId=${studentId}`),
    );
    setWordBooks(data.wordBooks);
  }, []);

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
        await loadWordBooks(nextStudentId);
      }
    },
    [loadWordBooks],
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
        playAudioUrl(nextAudioUrl);
      })
      .catch(() => {
        playAudioUrl(localAudio);
      });
  }, []);

  const submitLearningRecord = useCallback(
    async (result: "known" | "unknown") => {
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
        await loadWordBooks(activeStudent.id);
        await loadNextWord(activeStudent);
      } catch (error) {
        setLearningMessage(error instanceof Error ? error.message : "保存学习记录失败。");
      } finally {
        setIsSubmittingRecord(false);
      }
    },
    [activeStudent, isSubmittingRecord, learningWord, loadNextWord, loadWordBooks],
  );

  useEffect(() => {
    if (activeView !== "learning") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "r" || event.key === "R") {
        playAudioUrl(audioUrl);
      }

      if (event.key === " ") {
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
      { label: "连续打卡", value: activePlanBook ? "1 天" : "0 天" },
      {
        label: "累计词汇",
        value: String(wordBooks.reduce((total, book) => total + book.mastered_count, 0)),
      },
      { label: "今日已学", value: String(todayDone) },
    ],
    [activePlanBook, todayDone, wordBooks],
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

  async function createStudyPlan() {
    if (!activeStudent || !selectedBook) {
      return;
    }

    try {
      await readJson(
        await fetch("/api/study-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: activeStudent.id,
            wordBookId: selectedBook.id,
            dailyNewWordCount: dailyCount,
          }),
        }),
      );
      setSelectedBook(null);
      await loadWordBooks(activeStudent.id);
      setActiveView("learning");
      await loadNextWord(activeStudent);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "开启计划失败。");
    }
  }

  async function switchStudent(student: Student) {
    setActiveStudentId(student.id);
    await loadWordBooks(student.id);

    if (activeView === "learning") {
      await loadNextWord(student);
    }
  }

  async function openView(view: ViewKey) {
    setActiveView(view);

    if (view === "learning" && activeStudent) {
      await loadNextWord(activeStudent);
    }
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
              const enabled =
                item.key === "dashboard" || item.key === "library" || item.key === "learning";
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
              dashboardStats={dashboardStats}
              onOpenLearning={() => void openView("learning")}
              onOpenLibrary={() => void openView("library")}
            />
          ) : null}
          {activeView === "library" ? (
            <Library
              dailyCount={dailyCount}
              onCreateStudyPlan={() => void createStudyPlan()}
              onDailyCountChange={setDailyCount}
              onSelectBook={setSelectedBook}
              selectedBook={selectedBook}
              wordBooks={wordBooks}
            />
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
  dashboardStats,
  onOpenLearning,
  onOpenLibrary,
}: {
  activeBook?: WordBook;
  dashboardStats: { label: string; value: string }[];
  onOpenLearning: () => void;
  onOpenLibrary: () => void;
}) {
  const progressPercent = activeBook
    ? Math.round((activeBook.mastered_count / Math.max(activeBook.total_words, 1)) * 100)
    : 0;
  const heatmapDays = activeBook ? [1, 2, 3, 0, 2, 4, 1, 3, 4, 2, 0, 1, 3, 2] : Array(14).fill(0);

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
              {activeBook?.mastered_count ?? 0}/{activeBook?.daily_new_word_count ?? 0}
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
          <div className="review-count">0</div>
          <p>复习队列将在 Phase 3 接入艾宾浩斯算法。</p>
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
  dailyCount,
  onCreateStudyPlan,
  onDailyCountChange,
  onSelectBook,
  selectedBook,
  wordBooks,
}: {
  dailyCount: number;
  onCreateStudyPlan: () => void;
  onDailyCountChange: (count: number) => void;
  onSelectBook: (book: WordBook | null) => void;
  selectedBook: WordBook | null;
  wordBooks: WordBook[];
}) {
  return (
    <>
      <section className="page-heading" aria-labelledby="library-title">
        <div>
          <p className="eyebrow">Library</p>
          <h2 id="library-title">选词库</h2>
          <p>选择一本词书并设置每日新词量。</p>
        </div>
        <div className="search-box">
          <Search aria-hidden="true" size={20} />
          <span>搜索词书</span>
        </div>
      </section>

      <section className="book-grid" aria-label="词库列表">
        {wordBooks.map((book) => {
          const progressPercent = Math.round(
            (book.mastered_count / Math.max(book.total_words, 1)) * 100,
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
                    {book.mastered_count}/{book.total_words}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="progress-bar" aria-label={`${book.name} 学习进度`}>
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <button className="book-button" onClick={() => onSelectBook(book)} type="button">
                  <BookOpen aria-hidden="true" size={20} />
                  {book.active_plan_id ? "调整计划" : "选择"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {selectedBook ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="plan-dialog-title"
            aria-modal="true"
            className="plan-dialog"
            role="dialog"
          >
            <button
              aria-label="关闭"
              className="dialog-close"
              onClick={() => onSelectBook(null)}
              type="button"
            >
              <X aria-hidden="true" size={22} />
            </button>
            <p className="eyebrow">学习计划</p>
            <h3 id="plan-dialog-title">{selectedBook.name}</h3>
            <div className="count-options" aria-label="每日新词量">
              {dailyWordCounts.map((count) => (
                <button
                  className={dailyCount === count ? "count-option active" : "count-option"}
                  key={count}
                  onClick={() => onDailyCountChange(count)}
                  type="button"
                >
                  {dailyCount === count ? <Check aria-hidden="true" size={18} /> : null}
                  {count}
                </button>
              ))}
            </div>
            <button className="confirm-button" onClick={onCreateStudyPlan} type="button">
              <Play aria-hidden="true" size={22} />
              开启计划
            </button>
          </section>
        </div>
      ) : null}
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
  onSubmit: (result: "known" | "unknown") => void;
  phonetic: string | null;
  word: LearningWord | null;
}) {
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
                今日进度：{word.completed_count}/{word.daily_new_word_count}
              </span>
              <span>R 重听 · Space 翻卡 · ← 不认识 · → 认识</span>
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

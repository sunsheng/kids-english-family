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
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dictVoiceUrl, type Accent } from "@/lib/audio";
import { audioPlayer } from "@/lib/audio-player";
import { createDrillRounds, drillAnswer, maskedWord, type DrillRound } from "@/lib/spelling-drill";

type ViewKey =
  "dashboard" | "library" | "learning" | "test" | "review" | "vocabulary" | "stats" | "settings";
type SchoolStage = "primary" | "junior" | "senior";
type AccentPreference = Accent;

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
  preferred_publisher: string;
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

type TestWord = {
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
  preferredPublisher: string;
};

const navItems: { key: ViewKey; label: string; icon: typeof HomeIcon }[] = [
  { key: "dashboard", label: "仪表盘", icon: HomeIcon },
  { key: "library", label: "选词库", icon: LibraryBig },
  { key: "learning", label: "开始学习", icon: Play },
  { key: "test", label: "开始测试", icon: Keyboard },
  { key: "review", label: "复习中心", icon: RotateCcw },
  { key: "vocabulary", label: "生词本", icon: ListChecks },
  { key: "stats", label: "统计", icon: BarChart3 },
  { key: "settings", label: "设置", icon: Settings },
];

const DEFAULT_DAILY_NEW_WORD_COUNT = 20;

const stageLabels: Record<SchoolStage, string> = {
  primary: "小学",
  junior: "初中",
  senior: "高中",
};

const gradeOptions: Record<SchoolStage, string[]> = {
  primary: ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  junior: ["初一", "初二", "初三"],
  senior: ["高一", "高二", "高三"],
};

// 年级 -> 词书名称匹配关键词。高中教材按 必修/选择性必修 组织,按年级近似映射。
const gradeBookKeywords: Record<string, string[]> = {
  一年级: ["一年级"],
  二年级: ["二年级"],
  三年级: ["三年级"],
  四年级: ["四年级"],
  五年级: ["五年级"],
  六年级: ["六年级"],
  初一: ["七年级", "初一"],
  初二: ["八年级", "初二"],
  初三: ["九年级", "初三"],
  高一: ["必修", "高一"],
  高二: ["选择性必修", "选修", "高二"],
  高三: ["高三", "必修", "选修"],
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

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

type CalendarDay = {
  key: string;
  dayNumber: number;
  dateLabel: string;
  level: number;
  newCount: number;
  reviewCount: number;
  isToday: boolean;
  isFuture: boolean;
};

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function activityLevel(total: number) {
  if (total <= 0) return 0;
  if (total <= 5) return 1;
  if (total <= 10) return 2;
  if (total <= 19) return 3;
  return 4;
}

// 近两周迷你日历:按 周一~周日 对齐成两行(上周 + 本周),格子显示几号,悬停看当天明细。
function createCalendarDays(heatmap: DashboardData["heatmap"]): CalendarDay[] {
  const counts = new Map<string, { newCount: number; reviewCount: number }>();

  heatmap.forEach((day) => {
    counts.set(localDateKey(new Date(day.study_date)), {
      newCount: day.new_words_count,
      reviewCount: day.review_words_count,
    });
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - 7);

  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dayCounts = counts.get(localDateKey(date)) ?? { newCount: 0, reviewCount: 0 };

    return {
      key: localDateKey(date),
      dayNumber: date.getDate(),
      dateLabel: `${date.getMonth() + 1}月${date.getDate()}日`,
      level: activityLevel(dayCounts.newCount + dayCounts.reviewCount),
      newCount: dayCounts.newCount,
      reviewCount: dayCounts.reviewCount,
      isToday: date.getTime() === today.getTime(),
      isFuture: date.getTime() > today.getTime(),
    };
  });
}

type AudioWord = {
  spelling: string;
  phonetic_us: string | null;
  phonetic_uk: string | null;
  audio_us_url: string | null;
  audio_uk_url: string | null;
};

// 优先使用词库自带音频,否则回退到有道 dictvoice(国内直连、免 Key)。
function getWordAudio(word: AudioWord, student: Student | null) {
  const accent: AccentPreference = student?.preferred_accent ?? "us";
  const localAudio = accent === "uk" ? word.audio_uk_url : word.audio_us_url;

  return localAudio ?? dictVoiceUrl(word.spelling, accent);
}

// 词库释义常把多个词性挤在一行(如 "盖；帽子 vt. 覆盖；胜过 vi. 脱帽致意"),
// 这里按词性标记拆成多行,每行一个词性标签,只影响展示不改数据。
function splitDefinitionRows(definitions: { pos?: string; meaning: string }[]) {
  const rows: { pos: string | null; meaning: string }[] = [];
  const posMarker =
    /(?:^|\s)((?:n|v|vt|vi|adj|adv|prep|pron|conj|interj|int|art|num|aux|abbr)\.)\s*/gi;

  definitions.forEach((definition) => {
    const text = [definition.pos, definition.meaning].filter(Boolean).join(" ").trim();
    const markers = Array.from(text.matchAll(posMarker));

    if (markers.length === 0) {
      if (text) {
        rows.push({ pos: null, meaning: text });
      }
      return;
    }

    const lead = text.slice(0, markers[0].index).trim();
    if (lead) {
      rows.push({ pos: null, meaning: lead });
    }

    markers.forEach((marker, index) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = markers[index + 1]?.index ?? text.length;
      const meaning = text.slice(start, end).trim();

      if (meaning) {
        rows.push({ pos: marker[1], meaning });
      }
    });
  });

  return rows;
}

// 音标按词典惯例用中括号包起来;数据里若已带 /.../ 或 [...] 先剥掉,避免出现双层括号。
function formatPhonetic(phonetic: string | null) {
  const bare = phonetic
    ?.trim()
    .replace(/^[/[]+|[/\]]+$/g, "")
    .trim();

  return bare ? `[${bare}]` : null;
}

function getWordPhonetic(word: AudioWord, student: Student | null) {
  const accent: AccentPreference = student?.preferred_accent ?? "us";

  return formatPhonetic(accent === "uk" ? word.phonetic_uk : word.phonetic_us);
}

function matchesStudentGrade(book: WordBook, student: Student) {
  const keywords = gradeBookKeywords[student.grade_label];

  if (!keywords) {
    return true;
  }

  return keywords.some((keyword) => book.name.includes(keyword));
}

// 按学员设置(学段 + 教材版本 + 年级)对词库做初步筛选;考纲词汇只按学段。
function isRecommendedBook(book: WordBook, student: Student) {
  if (book.stage !== student.school_stage) {
    return false;
  }

  if (book.category === "exam_syllabus") {
    return true;
  }

  if (student.preferred_publisher && book.publisher !== student.preferred_publisher) {
    return false;
  }

  return matchesStudentGrade(book, student);
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [loginEmail, setLoginEmail] = useState("demo@example.com");
  const [loginPassword, setLoginPassword] = useState("demo123456");
  const [loginError, setLoginError] = useState("");
  const [activeStudent, setActiveStudent] = useState<Student | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [wordBooks, setWordBooks] = useState<WordBook[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [reviewWords, setReviewWords] = useState<ReviewWord[]>([]);
  const [vocabularyWords, setVocabularyWords] = useState<VocabularyWord[]>([]);
  const [vocabularyKeyword, setVocabularyKeyword] = useState("");
  const [studentForm, setStudentForm] = useState<StudentFormState | null>(null);
  const [learningWord, setLearningWord] = useState<LearningWord | null>(null);
  const [testWord, setTestWord] = useState<TestWord | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [reviewTestWord, setReviewTestWord] = useState<ReviewWord | null>(null);
  const [learningMessage, setLearningMessage] = useState("");
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isSubmittingRecord, setIsSubmittingRecord] = useState(false);
  const [appError, setAppError] = useState("");

  const activePlanBook = wordBooks.find((book) => book.plan_status === "in_progress");
  const todayTarget = activePlanBook?.daily_new_word_count ?? 0;
  const todayDone = dashboardData?.summary.today_new_words ?? 0;
  const learningAudioUrl = learningWord ? getWordAudio(learningWord, activeStudent) : null;

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

  // 一个账号对应一名学员:取账号下的学习档案,首次登录自动创建。
  const loadProfile = useCallback(
    async (currentUser: User) => {
      const data = await readJson<{ students: Student[] }>(
        await fetch(`/api/students?userId=${currentUser.id}`),
      );
      let profile = data.students[0] ?? null;

      if (!profile) {
        const created = await readJson<{ student: Student }>(
          await fetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: currentUser.id,
              name: currentUser.nickname ?? "小学员",
              schoolStage: "primary",
              gradeLabel: "三年级",
              preferredAccent: "us",
              preferredPublisher: "",
            }),
          }),
        );
        profile = created.student;
      }

      setActiveStudent(profile);
      await Promise.all([loadWordBooks(profile.id), loadDashboard(profile.id)]);
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
  }, []);

  // 测试进度独立于学习进度:/api/testing/next 按词书顺序取"已学会且尚未测对"的词。
  // 测对过的词不再重复出现;后学会或测错后重新学会的词会自动补进测试队列。
  const loadNextTestWord = useCallback(async (student: Student) => {
    const data = await readJson<{
      word: TestWord | null;
      reason?: "no_book" | "no_learned_words" | "completed";
    }>(await fetch(`/api/testing/next?studentId=${student.id}`));
    setTestWord(data.word);
    setTestMessage(
      data.word
        ? ""
        : data.reason === "no_book"
          ? "还没有选择词书。"
          : data.reason === "no_learned_words"
            ? "还没有可测试的单词：先去学习室学一学，点过“认识”的单词才会进入测试。"
            : "已学会的单词都测完了，学会新的单词后可以继续测试。",
    );
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

  // 新词拼写测试结果:走独立的 /api/testing/records,只推进测试游标,不影响学习进度。
  const submitTestWordRecord = useCallback(
    async (result: "correct" | "wrong") => {
      if (!activeStudent || !testWord || isSubmittingRecord) {
        return;
      }

      setIsSubmittingRecord(true);
      setTestMessage("");

      try {
        await readJson(
          await fetch("/api/testing/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: activeStudent.id,
              wordId: testWord.word_id,
              wordBookId: testWord.word_book_id,
              result,
            }),
          }),
        );
        await loadDashboard(activeStudent.id);
        await loadNextTestWord(activeStudent);
      } catch (error) {
        setTestMessage(error instanceof Error ? error.message : "保存测试记录失败。");
      } finally {
        setIsSubmittingRecord(false);
      }
    },
    [activeStudent, isSubmittingRecord, loadDashboard, loadNextTestWord, testWord],
  );

  const submitTestRecord = useCallback(
    async (result: "correct" | "wrong") => {
      if (reviewTestWord) {
        await submitReviewRecord(reviewTestWord, result);
        setReviewTestWord(null);
        setActiveView("review");
        return;
      }

      await submitTestWordRecord(result);
    },
    [reviewTestWord, submitReviewRecord, submitTestWordRecord],
  );

  // 刷新页面后通过会话 cookie 恢复登录状态,避免每次都要重新登录。
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const data = await readJson<{ user: User | null }>(await fetch("/api/auth/me"));

        if (data.user && !cancelled) {
          setUser(data.user);
          await loadProfile(data.user);
        }
      } catch {
        // 会话失效时停留在登录页即可。
      } finally {
        if (!cancelled) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  useEffect(() => {
    if (activeView !== "learning") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "r" || event.key === "R") {
        audioPlayer.replay(learningAudioUrl);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        audioPlayer.replay(learningAudioUrl);
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
  }, [activeView, learningAudioUrl, submitLearningRecord]);

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
      await loadProfile(data.user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败。");
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !studentForm?.id) {
      return;
    }

    const response = await fetch(`/api/students/${studentForm.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: studentForm.name,
        schoolStage: studentForm.schoolStage,
        gradeLabel: studentForm.gradeLabel,
        preferredAccent: studentForm.preferredAccent,
        preferredPublisher: studentForm.preferredPublisher,
      }),
    });

    try {
      const data = await readJson<{ student: Student }>(response);
      setActiveStudent(data.student);
      setStudentForm(null);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "保存学习档案失败。");
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

  async function openView(view: ViewKey) {
    audioPlayer.stop();
    setActiveView(view);

    if (view !== "test") {
      setReviewTestWord(null);
    }

    if (view === "learning" && activeStudent) {
      await loadNextWord(activeStudent);
    }

    if (view === "test" && activeStudent) {
      await loadNextTestWord(activeStudent);
    }

    if (view === "dashboard" && activeStudent) {
      await loadDashboard(activeStudent.id);
    }

    if (view === "library" && activeStudent) {
      await loadWordBooks(activeStudent.id);
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

  function handleLogout() {
    void fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setActiveStudent(null);
    setWordBooks([]);
    setActiveView("dashboard");
  }

  if (isRestoringSession) {
    return (
      <main className="login-page">
        <p className="session-loading">正在进入学习空间…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-page">
        <div className="login-hero" aria-hidden="true">
          <span className="login-bubble b1" />
          <span className="login-bubble b2" />
          <span className="login-bubble b3" />
        </div>
        <form className="login-panel" onSubmit={handleLogin}>
          <span className="login-logo" aria-hidden="true">
            <Sparkles size={26} />
          </span>
          <p className="eyebrow">少儿英语·家庭版</p>
          <h1>登录</h1>
          <p className="login-sub">一个账号一名学员，专注自己的英语学习。</p>
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
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <h1>少儿英语·家庭版</h1>
        </div>
        <div className="topbar-actions" aria-label="学习状态">
          <span className="today-chip">
            今日进度：{todayDone}/{todayTarget}
          </span>
          {activeStudent ? (
            <div className="student-section topbar-version">
              <div className="student-card compact active">
                <span className="avatar" aria-hidden="true">
                  {initials(activeStudent.name)}
                </span>
                <span className="student-info">
                  <strong>{activeStudent.name}</strong>
                  <small>{activeStudent.preferred_accent === "us" ? "美音" : "英音"}</small>
                </span>
              </div>
            </div>
          ) : null}
          <button aria-label="退出" onClick={handleLogout} type="button">
            <LogOut aria-hidden="true" size={18} />
            退出
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="主导航">
          {activeStudent ? (
            <section className="student-section" aria-label="学习档案">
              <div className="student-card active">
                <span className="avatar" aria-hidden="true">
                  {initials(activeStudent.name)}
                </span>
                <span>
                  <strong>{activeStudent.name}</strong>
                  <small>
                    {stageLabels[activeStudent.school_stage]}
                    {activeStudent.grade_label} ·{" "}
                    {activeStudent.preferred_accent === "us" ? "美音" : "英音"}
                  </small>
                </span>
              </div>
            </section>
          ) : null}

          <nav className="nav-list" aria-label="功能导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeView;

              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={`nav-link ${active ? "active" : ""}`}
                  key={item.key}
                  onClick={() => void openView(item.key)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={20} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="content" key={activeView}>
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
            <Library
              activeStudent={activeStudent}
              onStartBook={(book) => void startBook(book)}
              wordBooks={wordBooks}
            />
          ) : null}
          {activeView === "learning" ? (
            <LearningRoom
              activeStudent={activeStudent}
              audioUrl={learningAudioUrl}
              isCardFlipped={isCardFlipped}
              isSubmitting={isSubmittingRecord}
              learningMessage={learningMessage}
              onFlip={() => setIsCardFlipped((current) => !current)}
              onReplay={() => audioPlayer.replay(learningAudioUrl)}
              onSubmit={(result) => void submitLearningRecord(result)}
              phonetic={learningWord ? getWordPhonetic(learningWord, activeStudent) : null}
              word={learningWord}
            />
          ) : null}
          {activeView === "test" ? (
            <TestRoom
              activeStudent={activeStudent}
              isSubmitting={isSubmittingRecord}
              message={testMessage}
              onComplete={(result) => void submitTestRecord(result)}
              reviewWord={reviewTestWord}
              word={testWord}
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
          {activeView === "settings" ? (
            <SettingsPanel
              onEditProfile={() => {
                if (activeStudent) {
                  setStudentForm({
                    id: activeStudent.id,
                    name: activeStudent.name,
                    schoolStage: activeStudent.school_stage,
                    gradeLabel: activeStudent.grade_label,
                    preferredAccent: activeStudent.preferred_accent,
                    preferredPublisher: activeStudent.preferred_publisher,
                  });
                }
              }}
              onLogout={handleLogout}
              student={activeStudent}
              user={user}
              wordBooks={wordBooks}
            />
          ) : null}
        </main>
      </div>

      {studentForm ? (
        <StudentDialog
          form={studentForm}
          onChange={setStudentForm}
          onClose={() => setStudentForm(null)}
          onSubmit={(event) => void saveProfile(event)}
          publishers={publisherOptions(wordBooks)}
        />
      ) : null}
    </div>
  );
}

function publisherOptions(wordBooks: WordBook[]) {
  const publishers = new Set<string>();

  wordBooks.forEach((book) => {
    if (book.category === "textbook" && book.publisher) {
      publishers.add(book.publisher);
    }
  });

  return Array.from(publishers).sort((left, right) => left.localeCompare(right, "zh"));
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
  const calendarDays = createCalendarDays(dashboardData?.heatmap ?? []);
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
            <span style={{ width: `${Math.min(progressPercent, 100)}%` }} />
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
          <p className="calendar-range">
            {calendarDays[0].dateLabel} – {calendarDays[calendarDays.length - 1].dateLabel} ·
            上周与本周
          </p>
          <div className="calendar-grid" aria-label="最近两周学习日历">
            {WEEKDAY_LABELS.map((label) => (
              <span className="calendar-weekday" key={label}>
                {label}
              </span>
            ))}
            {calendarDays.map((day) => (
              <span
                className={`calendar-day${day.isToday ? " today" : ""}${day.isFuture ? " future" : ""}`}
                data-level={day.isFuture ? undefined : day.level}
                key={day.key}
                title={
                  day.isFuture
                    ? day.dateLabel
                    : `${day.dateLabel} · 新学 ${day.newCount} · 复习 ${day.reviewCount}`
                }
              >
                {day.dayNumber}
              </span>
            ))}
          </div>
          <div className="calendar-legend" aria-hidden="true">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <i data-level={level} key={level} />
            ))}
            <span>多</span>
          </div>
        </article>
      </section>
    </>
  );
}

function Library({
  activeStudent,
  onStartBook,
  wordBooks,
}: {
  activeStudent: Student | null;
  onStartBook: (book: WordBook) => void;
  wordBooks: WordBook[];
}) {
  const [mode, setMode] = useState<"recommended" | "all">("recommended");
  const [keyword, setKeyword] = useState("");
  const [stageFilter, setStageFilter] = useState<SchoolStage | "all">("all");
  const [publisherFilter, setPublisherFilter] = useState("");
  const publishers = publisherOptions(wordBooks);

  const visibleBooks = wordBooks.filter((book) => {
    if (keyword && !book.name.toLowerCase().includes(keyword.trim().toLowerCase())) {
      return false;
    }

    if (mode === "recommended" && activeStudent) {
      return isRecommendedBook(book, activeStudent);
    }

    if (stageFilter !== "all" && book.stage !== stageFilter) {
      return false;
    }

    if (publisherFilter && book.publisher !== publisherFilter) {
      return false;
    }

    return true;
  });

  const recommendSummary = activeStudent
    ? `${stageLabels[activeStudent.school_stage]}${activeStudent.grade_label}${
        activeStudent.preferred_publisher ? ` · ${activeStudent.preferred_publisher}` : ""
      }`
    : "";

  return (
    <>
      <section className="page-heading" aria-labelledby="library-title">
        <div>
          <p className="eyebrow">Library</p>
          <h2 id="library-title">选词库</h2>
          <p>
            {mode === "recommended" && activeStudent
              ? `已按学员设置（${recommendSummary}）自动筛选，可切换查看全部词书。`
              : "浏览全部词书，支持按学段和教材版本筛选。"}
          </p>
        </div>
        <label className="search-box interactive">
          <Search aria-hidden="true" size={20} />
          <input
            aria-label="搜索词书"
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索词书"
            value={keyword}
          />
        </label>
      </section>

      <section className="library-toolbar" aria-label="词库筛选">
        <div className="chip-group" role="tablist" aria-label="推荐或全部">
          <button
            className={`chip ${mode === "recommended" ? "active" : ""}`}
            onClick={() => setMode("recommended")}
            type="button"
          >
            <Sparkles aria-hidden="true" size={16} />
            推荐词书
          </button>
          <button
            className={`chip ${mode === "all" ? "active" : ""}`}
            onClick={() => setMode("all")}
            type="button"
          >
            全部词书
          </button>
        </div>
        {mode === "all" ? (
          <div className="library-filters">
            <div className="chip-group" aria-label="按学段筛选">
              {(["all", "primary", "junior", "senior"] as const).map((stage) => (
                <button
                  className={`chip ${stageFilter === stage ? "active" : ""}`}
                  key={stage}
                  onClick={() => setStageFilter(stage)}
                  type="button"
                >
                  {stage === "all" ? "全部学段" : stageLabels[stage]}
                </button>
              ))}
            </div>
            <select
              aria-label="按教材版本筛选"
              className="publisher-select"
              onChange={(event) => setPublisherFilter(event.target.value)}
              value={publisherFilter}
            >
              <option value="">全部版本</option>
              {publishers.map((publisher) => (
                <option key={publisher} value={publisher}>
                  {publisher}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <span className="library-count">{visibleBooks.length} 本词书</span>
      </section>

      <section className="book-grid" aria-label="词库列表">
        {visibleBooks.map((book) => {
          const progressPercent = Math.round(
            (book.learned_count / Math.max(book.total_words, 1)) * 100,
          );

          return (
            <article className="book-card" key={book.id}>
              <div className="book-cover" data-stage={book.stage}>
                <span>{book.publisher ?? "词书"}</span>
                {book.plan_status === "in_progress" ? <em className="book-badge">学习中</em> : null}
                {book.plan_status === "paused" ? (
                  <em className="book-badge paused">已暂停</em>
                ) : null}
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
        {visibleBooks.length === 0 ? (
          <div className="empty-state">
            <p>没有符合条件的词书，试试切换“全部词书”或调整筛选条件。</p>
          </div>
        ) : null}
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
  onSubmit: (result: "known" | "unknown") => void;
  phonetic: string | null;
  word: LearningWord | null;
}) {
  useEffect(() => {
    if (word) {
      audioPlayer.play(audioUrl, { key: `learning-${word.word_id}` });
    }
  }, [audioUrl, word]);

  const progressPercent = word
    ? Math.round((word.entry_order_index / Math.max(word.total_words, 1)) * 100)
    : 0;

  return (
    <>
      <section className="page-heading" aria-labelledby="learning-title">
        <div>
          <p className="eyebrow">Learning Room</p>
          <h2 id="learning-title">学习室</h2>
          <p>
            {word
              ? `${word.word_book_name} · ${activeStudent?.preferred_accent === "uk" ? "英音" : "美音"} · 按课程顺序学习`
              : "暂无可学习单词。"}
          </p>
        </div>
      </section>

      <section className="learning-panel" aria-label="单词卡片">
        {word ? (
          <>
            <div className="learning-progress">
              <span>
                学到 {word.entry_order_index}/{word.total_words}
              </span>
              <div className="progress-bar slim" aria-hidden="true">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="key-hints">↑ 重听 · ↓ 翻卡 · ← 不认识 · → 认识</span>
            </div>
            <button
              aria-pressed={isCardFlipped}
              className={`word-card ${isCardFlipped ? "flipped" : ""}`}
              key={word.word_id}
              onClick={onFlip}
              type="button"
            >
              <span className="word-card-inner">
                <span className="word-card-face front" aria-hidden={isCardFlipped}>
                  <span className="word-spelling">{word.spelling}</span>
                  {phonetic ? <span className="word-phonetic">{phonetic}</span> : null}
                  <span className="flip-hint">点击卡片或按空格键，翻转查看释义</span>
                </span>
                <span className="word-card-face back" aria-hidden={!isCardFlipped}>
                  <span className="word-spelling compact">{word.spelling}</span>
                  {phonetic ? <span className="word-phonetic">{phonetic}</span> : null}
                  <span className="word-detail">
                    {splitDefinitionRows(word.definitions).map((row, index) => (
                      <span className="definition-row" key={`${row.pos ?? ""}-${index}`}>
                        {row.pos ? <i className="pos-tag">{row.pos}</i> : null}
                        {row.meaning}
                      </span>
                    ))}
                    {word.example_sentence ? <em>{word.example_sentence}</em> : null}
                    {word.example_translation ? <small>{word.example_translation}</small> : null}
                  </span>
                  <span className="flip-hint">再点一下翻回正面</span>
                </span>
              </span>
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
  isSubmitting,
  message,
  onComplete,
  reviewWord,
  word,
}: {
  activeStudent: Student | null;
  isSubmitting: boolean;
  message: string;
  onComplete: (result: "correct" | "wrong") => void;
  reviewWord: ReviewWord | null;
  word: TestWord | null;
}) {
  const testWord = reviewWord ?? word;
  const spelling = testWord?.spelling ?? "";
  const audioUrl = testWord ? getWordAudio(testWord, activeStudent) : null;
  const phonetic = testWord ? getWordPhonetic(testWord, activeStudent) : null;
  const stageSize = word?.stage_size ?? 10;
  const stageNumber = word ? Math.ceil(word.entry_order_index / stageSize) : 0;
  const stagePosition = word ? ((word.entry_order_index - 1) % stageSize) + 1 : 0;

  return (
    <>
      <section className="page-heading" aria-labelledby="test-title">
        <div>
          <p className="eyebrow">Test Room</p>
          <h2 id="test-title">测试</h2>
          <p>
            {testWord
              ? `${reviewWord ? "复习测试" : "词书测试"} · ${activeStudent?.preferred_accent === "uk" ? "英音" : "美音"}`
              : "暂无可测试单词。"}
          </p>
        </div>
      </section>

      <section className="learning-panel" aria-label="拼写测试">
        {testWord ? (
          <>
            <div className="test-summary">
              <div>
                {phonetic ? <span className="word-phonetic">{phonetic}</span> : null}
                <p>听发音，按键盘输入缺失字母。</p>
              </div>
              {reviewWord ? (
                <span>到期复习</span>
              ) : word ? (
                <span className="test-progress-meta">
                  <strong>{word.word_book_name}</strong>第 {stageNumber} 阶段 · 本阶段{" "}
                  {stagePosition}/
                  {Math.min(
                    stageSize,
                    Math.max(word.total_words - (stageNumber - 1) * stageSize, 1),
                  )}{" "}
                  · 全书 {word.entry_order_index}/{word.total_words}
                </span>
              ) : null}
            </div>
            <SpellingDrill
              audioUrl={audioUrl}
              disabled={isSubmitting}
              key={`${reviewWord ? "review" : "book"}-${testWord.word_id}`}
              onComplete={onComplete}
              onReplay={() => audioPlayer.replay(audioUrl)}
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
  const inputRef = useRef<HTMLInputElement>(null);
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
    audioPlayer.play(audioUrl, { key: `spelling-${word}-${roundIndex}` });
  }, [audioUrl, roundIndex, word]);

  const submitRound = useCallback(() => {
    if (!isComplete || disabled) {
      return;
    }

    const expected = drillAnswer(word, round);
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

      // 拼写输入框(移动端虚拟键盘)自己处理输入,避免重复录入。
      if (event.target instanceof HTMLInputElement) {
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
      <div className="letter-grid-wrap">
        <div className="letter-grid" aria-label="字母格">
          {cells.map(({ answer, index, letter }) => {
            if (letter) {
              // 空格、连字符等分隔符不参与作答,渲染为窄的分隔格。
              const isSeparator = !/[a-z]/i.test(letter);

              return (
                <span
                  className={`letter-cell ${isSeparator ? "separator" : "fixed"}`}
                  key={`${letter}-${index}`}
                >
                  {isSeparator ? letter.trim() : letter}
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
        <input
          aria-label="拼写输入"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          className="drill-input"
          disabled={disabled}
          enterKeyHint="done"
          onChange={(event) => {
            const letters = event.target.value
              .toLowerCase()
              .replace(/[^a-z]/g, "")
              .slice(0, round.length);
            setAnswers(letters.split(""));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitRound();
            }
          }}
          ref={inputRef}
          spellCheck={false}
          value={answers.join("")}
        />
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
  const startedBooks = wordBooks.filter((book) => book.active_plan_id);

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
        {startedBooks.map((book) => (
          <article className="vocab-item" key={book.id}>
            <div>
              <h3>{book.name}</h3>
              <p>
                {book.learned_count}/{book.total_words} ·{" "}
                {book.plan_status === "in_progress" ? "学习中" : "已暂停，进度保留"}
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
        {startedBooks.length === 0 ? (
          <div className="empty-state">
            <p>还没有开始学习任何词书。</p>
          </div>
        ) : null}
      </section>
    </>
  );
}

function SettingsPanel({
  onEditProfile,
  onLogout,
  student,
  user,
  wordBooks,
}: {
  onEditProfile: () => void;
  onLogout: () => void;
  student: Student | null;
  user: User;
  wordBooks: WordBook[];
}) {
  const textbookCount = wordBooks.filter((book) => book.category === "textbook").length;

  return (
    <>
      <section className="page-heading" aria-labelledby="settings-title">
        <div>
          <p className="eyebrow">Settings</p>
          <h2 id="settings-title">用户设置</h2>
          <p>设置学段、年级和教材版本后，选词库会按设置自动筛选。</p>
        </div>
        <button className="primary-action" onClick={onEditProfile} type="button">
          <Pencil aria-hidden="true" size={22} />
          编辑学习档案
        </button>
      </section>

      <section className="settings-section" aria-labelledby="settings-profile-title">
        <h3 id="settings-profile-title">学习档案</h3>
        {student ? (
          <div className="settings-student-list">
            <article className="settings-student-card active">
              <div className="settings-student-main">
                <span className="avatar" aria-hidden="true">
                  {initials(student.name)}
                </span>
                <span className="settings-student-info">
                  <strong>{student.name}</strong>
                  <small>
                    {stageLabels[student.school_stage]}
                    {student.grade_label} · {student.preferred_accent === "us" ? "美音" : "英音"} ·{" "}
                    {student.preferred_publisher || "教材版本不限"}
                  </small>
                </span>
              </div>
              <div className="student-actions">
                <button
                  aria-label="编辑学习档案"
                  className="icon-action"
                  onClick={onEditProfile}
                  type="button"
                >
                  <Pencil aria-hidden="true" size={16} />
                </button>
              </div>
            </article>
          </div>
        ) : null}
        <p className="settings-hint">
          学习进度、测试进度、生词本按账号独立保存；在不同词书（不同版本/学期）之间切换时，各词书进度互不影响。
        </p>
      </section>

      <section className="settings-section" aria-labelledby="settings-account-title">
        <h3 id="settings-account-title">账号</h3>
        <div className="settings-account">
          <div className="settings-account-row">
            <UserRound aria-hidden="true" size={20} />
            <div>
              <strong>{user.nickname ?? "学员"}</strong>
              <small>{user.email}</small>
            </div>
          </div>
          <div className="settings-account-row">
            <LibraryBig aria-hidden="true" size={20} />
            <div>
              <strong>词库</strong>
              <small>
                共 {wordBooks.length} 本词书，其中教材同步 {textbookCount} 本
              </small>
            </div>
          </div>
          <button className="book-button secondary" onClick={onLogout} type="button">
            <LogOut aria-hidden="true" size={18} />
            退出登录
          </button>
        </div>
      </section>
    </>
  );
}

function StudentDialog({
  form,
  onChange,
  onClose,
  onSubmit,
  publishers,
}: {
  form: StudentFormState;
  onChange: (form: StudentFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  publishers: string[];
}) {
  const grades = gradeOptions[form.schoolStage];

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
        <p className="eyebrow">学习档案</p>
        <h3 id="student-dialog-title">编辑学习档案</h3>
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
            onChange={(event) => {
              const nextStage = event.target.value as SchoolStage;
              onChange({
                ...form,
                schoolStage: nextStage,
                gradeLabel: gradeOptions[nextStage][0],
              });
            }}
            value={form.schoolStage}
          >
            <option value="primary">小学</option>
            <option value="junior">初中</option>
            <option value="senior">高中</option>
          </select>
        </label>
        <label>
          年级
          <select
            onChange={(event) => onChange({ ...form, gradeLabel: event.target.value })}
            value={grades.includes(form.gradeLabel) ? form.gradeLabel : grades[0]}
          >
            {grades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </label>
        <label>
          教材版本
          <select
            onChange={(event) => onChange({ ...form, preferredPublisher: event.target.value })}
            value={form.preferredPublisher}
          >
            <option value="">不限（显示全部版本）</option>
            {publishers.map((publisher) => (
              <option key={publisher} value={publisher}>
                {publisher}
              </option>
            ))}
          </select>
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

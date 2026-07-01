"use client";

import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Home as HomeIcon,
  LibraryBig,
  ListChecks,
  LogOut,
  Play,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";

type ViewKey = "dashboard" | "library";

const students = [
  { name: "小明", stage: "小学五年级", initials: "明", active: true },
  { name: "小红", stage: "初一", initials: "红", active: false },
];

const navItems = [
  { key: "dashboard", label: "仪表盘", icon: HomeIcon },
  { key: "library", label: "选词库", icon: LibraryBig },
  { key: "learning", label: "开始学习", icon: Play },
  { key: "review", label: "复习中心", icon: RotateCcw },
  { key: "vocabulary", label: "生词本", icon: ListChecks },
  { key: "stats", label: "统计", icon: BarChart3 },
];

const dashboardStats = [
  { label: "连续打卡", value: "6 天" },
  { label: "累计词汇", value: "186" },
  { label: "今日已学", value: "12" },
];

const heatmapDays = [1, 2, 3, 0, 2, 4, 1, 3, 4, 2, 0, 1, 3, 2];

const wordBooks = [
  {
    title: "人教版五年级上册",
    meta: "教材同步 · 小学",
    total: 168,
    progress: 42,
    publisher: "人教版",
  },
  {
    title: "外研版七年级上册",
    meta: "教材同步 · 初中",
    total: 214,
    progress: 0,
    publisher: "外研版",
  },
  {
    title: "小学核心词",
    meta: "考纲词汇 · 小学",
    total: 620,
    progress: 186,
    publisher: "核心词",
  },
  {
    title: "中考 1600 词",
    meta: "考纲词汇 · 初中",
    total: 1600,
    progress: 0,
    publisher: "中考",
  },
];

const dailyWordCounts = [10, 20, 30];

export default function Home() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [selectedBook, setSelectedBook] = useState<(typeof wordBooks)[number] | null>(null);
  const [dailyCount, setDailyCount] = useState(20);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">少儿英语·家庭版</p>
          <h1>当前学员：小明</h1>
        </div>
        <div className="topbar-actions" aria-label="学习状态">
          <span>今日进度：12/20</span>
          <button aria-label="退出" type="button">
            <LogOut aria-hidden="true" size={18} />
            退出
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="主导航">
          <section className="student-section" aria-labelledby="students-title">
            <h2 id="students-title">家庭学员</h2>
            <div className="student-list">
              {students.map((student) => (
                <button
                  className={student.active ? "student-card active" : "student-card"}
                  key={student.name}
                  type="button"
                >
                  <span className="avatar" aria-hidden="true">
                    {student.initials}
                  </span>
                  <span>
                    <strong>{student.name}</strong>
                    <small>{student.stage}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <nav className="nav-list" aria-label="功能导航">
            {navItems.map((item) => {
              const Icon = item.icon;
              const enabled = item.key === "dashboard" || item.key === "library";
              const active = item.key === activeView;

              return (
                <button
                  aria-current={active ? "page" : undefined}
                  aria-disabled={!enabled}
                  className={`nav-link ${active ? "active" : ""} ${enabled ? "" : "disabled"}`}
                  key={item.key}
                  onClick={() => {
                    if (enabled) {
                      setActiveView(item.key as ViewKey);
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
          {activeView === "dashboard" ? (
            <Dashboard onOpenLibrary={() => setActiveView("library")} />
          ) : (
            <Library
              dailyCount={dailyCount}
              onDailyCountChange={setDailyCount}
              onSelectBook={setSelectedBook}
              selectedBook={selectedBook}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function Dashboard({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  return (
    <>
      <section className="page-heading" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2 id="dashboard-title">仪表盘</h2>
          <p>欢迎回来，小明。今天还有 8 个新词待完成。</p>
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
            <span>人教版五年级上册</span>
            <strong>12/20</strong>
          </div>
          <div className="progress-bar" aria-label="今日进度">
            <span style={{ width: "60%" }} />
          </div>
          <button className="start-button" type="button">
            <Play aria-hidden="true" size={22} />
            开始学习
          </button>
        </article>

        <article className="review-card">
          <div className="section-title">
            <RotateCcw aria-hidden="true" size={22} />
            <h3>复习任务</h3>
          </div>
          <div className="review-count">18</div>
          <p>其中 5 个来自生词本。</p>
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
  onDailyCountChange,
  onSelectBook,
  selectedBook,
}: {
  dailyCount: number;
  onDailyCountChange: (count: number) => void;
  onSelectBook: (book: (typeof wordBooks)[number] | null) => void;
  selectedBook: (typeof wordBooks)[number] | null;
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
          const progressPercent = Math.round((book.progress / book.total) * 100);

          return (
            <article className="book-card" key={book.title}>
              <div className="book-cover">
                <span>{book.publisher}</span>
              </div>
              <div className="book-body">
                <p>{book.meta}</p>
                <h3>{book.title}</h3>
                <div className="book-progress">
                  <span>
                    {book.progress}/{book.total}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="progress-bar" aria-label={`${book.title} 学习进度`}>
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <button className="book-button" onClick={() => onSelectBook(book)} type="button">
                  <BookOpen aria-hidden="true" size={20} />
                  选择
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
            <h3 id="plan-dialog-title">{selectedBook.title}</h3>
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
            <button className="confirm-button" onClick={() => onSelectBook(null)} type="button">
              <Play aria-hidden="true" size={22} />
              开启计划
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}

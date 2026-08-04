"use client";

import Sidebar from "@components/SettingsPanel/Sidebar";
import { setting_tabs } from "@components/SettingsPanel/config";
import {
  ProgressKeyType,
  useProgressOptions,
  useQuestProgress,
} from "@hooks/useProgress";
import useStorage from "@hooks/useStorage";
import { useZen } from "@hooks/useZen";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import {
  LuArrowRight,
  LuBadgeCheck,
  LuCalendarCheck,
  LuChartNoAxesColumnIncreasing,
  LuCrown,
  LuFlame,
  LuGem,
  LuGift,
  LuSettings,
  LuSparkles,
  LuTarget,
  LuZap,
} from "react-icons/lu";

type ProgressHistoryEntry = {
  date: string;
  marked: number;
  ac: number;
  working: number;
  review: number;
  hard: number;
};

const HISTORY_KEY = "lc-rating-progress-history";

const formatDay = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const displayOptionLabel = (key: string, label?: string) => {
  if (label) return label;
  if (key === "TODO") return "待开始";
  return key;
};

const sameSnapshot = (
  entry: ProgressHistoryEntry | undefined,
  snapshot: ProgressHistoryEntry,
) => {
  return (
    entry?.date === snapshot.date &&
    entry.marked === snapshot.marked &&
    entry.ac === snapshot.ac &&
    entry.working === snapshot.working &&
    entry.review === snapshot.review &&
    entry.hard === snapshot.hard
  );
};

const diffDays = (a: string, b: string) => {
  const start = new Date(`${a}T00:00:00`).getTime();
  const end = new Date(`${b}T00:00:00`).getTime();
  return Math.round((end - start) / 86400000);
};

const computeStreak = (entries: ProgressHistoryEntry[]) => {
  if (entries.length === 0) return 0;

  let streak = 1;
  for (let i = entries.length - 1; i > 0; i -= 1) {
    if (diffDays(entries[i - 1].date, entries[i].date) === 1) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
};

export default function Profile() {
  const { zen } = useZen();
  const { allProgress } = useQuestProgress();
  const { optionKeys, getOption } = useProgressOptions();
  const [activeTab, setActiveTab] = useState(setting_tabs[0].key);
  const [history = [], setHistory] = useStorage<ProgressHistoryEntry[]>(
    HISTORY_KEY,
    {
      defaultValue: [],
    },
  );

  const counts = useMemo(() => {
    const base = optionKeys.reduce<Record<string, number>>((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});

    Object.values(allProgress).forEach((progress) => {
      base[progress] = (base[progress] || 0) + 1;
    });

    return base;
  }, [allProgress, optionKeys]);

  const snapshot = useMemo<ProgressHistoryEntry>(() => {
    return {
      date: formatDay(new Date()),
      marked: Object.keys(allProgress).length,
      ac: counts.AC || 0,
      working: counts.WORKING || 0,
      review: counts.REVIEW_NEEDED || 0,
      hard: counts.TOO_HARD || 0,
    };
  }, [allProgress, counts]);

  useEffect(() => {
    setHistory((current = []) => {
      const existing = current || [];
      const last = existing[existing.length - 1];

      if (sameSnapshot(last, snapshot)) {
        return current;
      }

      if (last?.date === snapshot.date) {
        return [...existing.slice(0, -1), snapshot];
      }

      return [...existing, snapshot].slice(-90);
    });
  }, [snapshot, setHistory]);

  const ActiveSettings = setting_tabs.find(
    (tab) => tab.key === activeTab,
  )?.component;

  const totalPool = Math.max(zen.length, snapshot.marked, 1);
  const solvedPercent = Math.round((snapshot.ac / totalPool) * 100);
  const startedPercent = Math.round((snapshot.marked / totalPool) * 100);
  const recentHistory = history.slice(-14);
  const maxMarked = Math.max(...recentHistory.map((item) => item.marked), 1);
  const xp = snapshot.ac * 10 + snapshot.working * 3 + snapshot.review * 2;
  const level = Math.max(1, Math.floor(xp / 120) + 1);
  const levelStart = (level - 1) * 120;
  const levelProgress = Math.min(100, Math.round(((xp - levelStart) / 120) * 100));
  const nextSolvedGoal = Math.max(5, Math.ceil((snapshot.ac + 1) / 5) * 5);
  const solvedToGoal = Math.max(0, nextSolvedGoal - snapshot.ac);
  const todayEntry = history[history.length - 1];
  const previousEntry =
    todayEntry?.date === snapshot.date ? history[history.length - 2] : todayEntry;
  const todayGain = Math.max(
    0,
    snapshot.ac - (previousEntry?.ac ?? snapshot.ac),
  );
  const streak = computeStreak(history);
  const nextActionLabel =
    snapshot.working > 0
      ? "继续攻略中的题目"
      : snapshot.review > 0
        ? "先复习一题"
        : "开始一题新挑战";

  const statusRows = optionKeys
    .map((key) => {
      const option = getOption(key as ProgressKeyType);
      return {
        key,
        label: displayOptionLabel(key, option.label),
        color: option.color,
        count: counts[key] || 0,
      };
    })
    .filter((item) => item.key !== "TODO" || item.count > 0);

  const milestones = [
    {
      title: "First AC",
      text: "完成第一题",
      done: snapshot.ac >= 1,
      icon: LuSparkles,
    },
    {
      title: "5 Wins",
      text: "过 5 题",
      done: snapshot.ac >= 5,
      icon: LuGift,
    },
    {
      title: "25 Wins",
      text: "进入节奏",
      done: snapshot.ac >= 25,
      icon: LuGem,
    },
    {
      title: "100 Wins",
      text: "稳定刷题",
      done: snapshot.ac >= 100,
      icon: LuCrown,
    },
  ];

  return (
    <Container fluid className="profile page-shell">
      <section className="profile-hero">
        <div className="hero-copy">
          <p className="eyebrow">Practice streak</p>
          <h1>今天也推进一点点</h1>
          <p>
            本页只读取当前浏览器里的本地进度。把目标拆小一点，看到数字上涨，会更容易坚持。
          </p>
          <div className="hero-actions">
            <Link href="/zen" className="primary-quest">
              <LuZap aria-hidden size={18} />
              <span>{nextActionLabel}</span>
              <LuArrowRight aria-hidden size={18} />
            </Link>
            <span className="quest-note">
              距离 {nextSolvedGoal} 题还差 <strong>{solvedToGoal}</strong> 题
            </span>
          </div>
        </div>

        <div className="level-card">
          <div className="level-orb">
            <span>Lv</span>
            <strong>{level}</strong>
          </div>
          <div className="level-copy">
            <span>Training XP</span>
            <strong>{xp}</strong>
            <div className="level-track" aria-label={`Level ${levelProgress}%`}>
              <span style={{ width: `${levelProgress}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="profile-grid">
        <div className="profile-card metric-card solved">
          <LuBadgeCheck aria-hidden size={22} />
          <span>已通过</span>
          <strong>{snapshot.ac}</strong>
        </div>
        <div className="profile-card metric-card active">
          <LuFlame aria-hidden size={22} />
          <span>攻略中</span>
          <strong>{snapshot.working}</strong>
        </div>
        <div className="profile-card metric-card streak">
          <LuCalendarCheck aria-hidden size={22} />
          <span>连续记录</span>
          <strong>{streak}</strong>
        </div>
        <div className="profile-card metric-card today">
          <LuTarget aria-hidden size={22} />
          <span>今日新增 AC</span>
          <strong>{todayGain}</strong>
        </div>
      </section>

      <section className="profile-main">
        <div className="profile-card trend-card">
          <div className="profile-card-header">
            <div>
              <p className="eyebrow">Momentum</p>
              <h2>每日累计</h2>
            </div>
            <LuChartNoAxesColumnIncreasing aria-hidden size={22} />
          </div>
          <div className="trend-chart">
            {recentHistory.length === 0 ? (
              <div className="empty-state">今天会生成第一条进度快照。</div>
            ) : (
              recentHistory.map((item) => (
                <div className="trend-bar-item" key={item.date}>
                  <div className="trend-bar-track">
                    <span
                      className="trend-bar"
                      style={{
                        height: `${Math.max(8, (item.marked / maxMarked) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="trend-value">{item.marked}</span>
                  <span className="trend-date">{item.date.slice(5)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="profile-card quest-card">
          <div className="profile-card-header">
            <div>
              <p className="eyebrow">Quest map</p>
              <h2>小成就</h2>
            </div>
          </div>
          <div className="milestone-path">
            {milestones.map(({ title, text, done, icon: Icon }) => (
              <div className={`milestone ${done ? "done" : ""}`} key={title}>
                <span className="milestone-icon">
                  <Icon aria-hidden size={20} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="profile-lower">
        <div className="profile-card status-card">
          <div className="profile-card-header">
            <div>
              <p className="eyebrow">Status</p>
              <h2>进度分布</h2>
            </div>
          </div>
          <div className="status-list">
            {statusRows.map((item) => (
              <div className="status-row" key={item.key}>
                <span
                  className="status-dot"
                  style={{ background: item.color }}
                />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="profile-card progress-card">
          <div
            className="progress-ring"
            style={{
              background: `conic-gradient(var(--app-accent) ${solvedPercent * 3.6}deg, var(--app-surface-muted) 0deg)`,
            }}
            aria-label={`Solved ${solvedPercent}%`}
          >
            <span>{solvedPercent}%</span>
          </div>
          <div>
            <p className="eyebrow">Total progress</p>
            <h2>
              {snapshot.ac} / {totalPool}
            </h2>
            <p>
              已启动 {startedPercent}% 的练习池。保持每天一题，曲线会越来越好看。
            </p>
          </div>
        </div>
      </section>

      <section className="profile-card settings-dashboard">
        <div className="profile-card-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>站点设置</h2>
          </div>
          <LuSettings aria-hidden size={22} />
        </div>
        <div className="settings-layout">
          <aside className="settings-sidebar">
            <Sidebar
              tabs={setting_tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </aside>
          <div className="settings-content">
            {ActiveSettings ? ActiveSettings : "页面配置错误"}
          </div>
        </div>
      </section>
    </Container>
  );
}

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
import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuBadgeCheck,
  LuBookOpen,
  LuCalendarCheck,
  LuCheck,
  LuCrown,
  LuFlame,
  LuFootprints,
  LuGem,
  LuSparkles,
  LuStar,
  LuSwords,
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
const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const XP_PER_LEVEL = 120;

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

const countsChanged = (
  prev: ProgressHistoryEntry,
  next: ProgressHistoryEntry,
) => {
  return (
    prev.marked !== next.marked ||
    prev.ac !== next.ac ||
    prev.working !== next.working ||
    prev.review !== next.review ||
    prev.hard !== next.hard
  );
};

// A day only counts as "active" when progress actually changed that day,
// so the streak measures real practice instead of page visits.
const isActiveDay = (entries: ProgressHistoryEntry[], index: number) => {
  if (index === 0) return entries[0].marked > 0;
  return countsChanged(entries[index - 1], entries[index]);
};

type Tone = "green" | "blue" | "orange" | "gold" | "purple";

type Achievement = {
  icon: IconType;
  tone: Tone;
  name: string;
  desc: string;
  goal: number;
  value: number;
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
  const startedPercent = Math.round((snapshot.marked / totalPool) * 100);

  const activeDates = useMemo(() => {
    const dates = new Set<string>();
    history.forEach((entry, index) => {
      if (isActiveDay(history, index)) dates.add(entry.date);
    });
    return dates;
  }, [history]);

  const todayActive = activeDates.has(snapshot.date);

  const streak = useMemo(() => {
    if (history.length === 0) return 0;

    let end = history.length - 1;
    // Today still counts as "pending": judge the streak from yesterday
    // until practice actually happens today.
    if (history[end].date === snapshot.date && !todayActive) {
      end -= 1;
    }

    let count = 0;
    for (let i = end; i >= 0; i -= 1) {
      if (!activeDates.has(history[i].date)) break;
      count += 1;
      if (i > 0 && diffDays(history[i - 1].date, history[i].date) !== 1) break;
    }
    return count;
  }, [history, activeDates, snapshot.date, todayActive]);

  const weekDays = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

    return WEEK_LABELS.map((label, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      const key = formatDay(day);
      return {
        key,
        label,
        active: activeDates.has(key),
        isToday: key === snapshot.date,
        isFuture: diffDays(snapshot.date, key) > 0,
      };
    });
  }, [activeDates, snapshot.date]);

  const xp = snapshot.ac * 10 + snapshot.working * 3 + snapshot.review * 2;
  const level = Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
  const levelStart = (level - 1) * XP_PER_LEVEL;
  const xpToNext = levelStart + XP_PER_LEVEL - xp;
  const levelProgress = Math.min(
    100,
    Math.round(((xp - levelStart) / XP_PER_LEVEL) * 100),
  );

  const lastEntry = history[history.length - 1];
  const todayEntry = lastEntry?.date === snapshot.date ? lastEntry : undefined;
  const previousEntry = todayEntry ? history[history.length - 2] : lastEntry;
  const todayGain = Math.max(
    0,
    snapshot.ac - (previousEntry?.ac ?? snapshot.ac),
  );

  const heroTitle =
    streak > 0 ? `${streak} 天连胜` : todayActive ? "今日已打卡" : "点燃小火苗";
  const heroMessage = todayActive
    ? "今天的目标已经达成，小火苗烧得正旺。"
    : streak > 0
      ? "今天还没刷题，别让连胜的小火苗熄灭哦。"
      : snapshot.marked > 0
        ? "今天完成一道题，重新开始你的连胜。"
        : "标记或 AC 一道题，从今天开始记录。";
  const heroCta = todayActive
    ? "再刷一题"
    : snapshot.marked === 0
      ? "去刷第一题"
      : "去刷一题";

  const stats: { icon: IconType; tone: Tone; label: string; value: number }[] =
    [
      { icon: LuBadgeCheck, tone: "green", label: "已通过", value: snapshot.ac },
      { icon: LuSwords, tone: "blue", label: "攻略中", value: snapshot.working },
      { icon: LuBookOpen, tone: "orange", label: "待复习", value: snapshot.review },
      { icon: LuSparkles, tone: "gold", label: "今日新增", value: todayGain },
    ];

  const achievements: Achievement[] = [
    {
      icon: LuFootprints,
      tone: "blue",
      name: "迈出第一步",
      desc: "标记第 1 道题",
      goal: 1,
      value: snapshot.marked,
    },
    {
      icon: LuBadgeCheck,
      tone: "green",
      name: "首开纪录",
      desc: "AC 第 1 道题",
      goal: 1,
      value: snapshot.ac,
    },
    {
      icon: LuZap,
      tone: "green",
      name: "五题斩",
      desc: "累计 AC 5 道题",
      goal: 5,
      value: snapshot.ac,
    },
    {
      icon: LuFlame,
      tone: "orange",
      name: "三日小火苗",
      desc: "连续刷题 3 天",
      goal: 3,
      value: streak,
    },
    {
      icon: LuCalendarCheck,
      tone: "purple",
      name: "七日之约",
      desc: "连续刷题 7 天",
      goal: 7,
      value: streak,
    },
    {
      icon: LuStar,
      tone: "gold",
      name: "渐入佳境",
      desc: "累计 AC 25 道题",
      goal: 25,
      value: snapshot.ac,
    },
    {
      icon: LuGem,
      tone: "blue",
      name: "半百俱乐部",
      desc: "累计 AC 50 道题",
      goal: 50,
      value: snapshot.ac,
    },
    {
      icon: LuCrown,
      tone: "gold",
      name: "百题斩",
      desc: "累计 AC 100 道题",
      goal: 100,
      value: snapshot.ac,
    },
  ];
  const unlockedCount = achievements.filter(
    (item) => item.value >= item.goal,
  ).length;

  const preferredOrder = ["AC", "WORKING", "REVIEW_NEEDED", "TOO_HARD", "TODO"];
  const orderedKeys = [
    ...preferredOrder.filter((key) => optionKeys.includes(key)),
    ...optionKeys.filter((key) => !preferredOrder.includes(key)),
  ];
  const segments = orderedKeys
    .map((key) => {
      const option = getOption(key as ProgressKeyType);
      return {
        key,
        label: displayOptionLabel(key, option.label),
        color: option.color,
        count: counts[key] || 0,
      };
    })
    .filter((item) => item.count > 0);
  const unstarted = Math.max(0, totalPool - snapshot.marked);

  const recentHistory = history.slice(-14);
  const maxMarked = Math.max(...recentHistory.map((item) => item.marked), 1);

  return (
    <Container fluid className="profile page-shell">
      <section className="duo-card duo-hero">
        <div className="duo-hero-top">
          <div
            className={clsx("flame-chip", {
              lit: streak > 0,
              hungry: streak > 0 && !todayActive,
            })}
          >
            <LuFlame aria-hidden size={46} />
          </div>
          <div className="duo-hero-copy">
            <h1>{heroTitle}</h1>
            <p>{heroMessage}</p>
          </div>
          <Link href="/zen" className="duo-btn">
            {todayActive ? (
              <LuZap aria-hidden size={18} />
            ) : (
              <LuArrowRight aria-hidden size={18} />
            )}
            <span>{heroCta}</span>
          </Link>
        </div>
        <div className="duo-week" aria-label="本周打卡">
          {weekDays.map((day) => (
            <div
              className={clsx("duo-day", {
                active: day.active,
                today: day.isToday,
                future: day.isFuture,
              })}
              key={day.key}
            >
              <span className="duo-day-dot">
                {day.active ? <LuFlame aria-hidden size={15} /> : null}
              </span>
              <span className="duo-day-label">{day.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="duo-card duo-level">
        <div className="level-badge">Lv.{level}</div>
        <div className="level-body">
          <div className="level-labels">
            <span>{xp} XP</span>
            <span className="muted">
              再得 {xpToNext} XP 升到 Lv.{level + 1}
            </span>
          </div>
          <div
            className="duo-bar gold"
            role="progressbar"
            aria-valuenow={levelProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${levelProgress}%` }} />
          </div>
        </div>
      </section>

      <section className="duo-stats">
        {stats.map(({ icon: Icon, tone, label, value }) => (
          <div className="duo-card duo-stat" key={label}>
            <span className={`duo-chip ${tone}`}>
              <Icon aria-hidden size={22} />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="duo-card">
        <header className="duo-card-head">
          <h2>最近 14 天</h2>
          <span className="meta">累计标记题数</span>
        </header>
        {recentHistory.length === 0 ? (
          <div className="duo-empty">
            完成一道题，这里就会长出第一根柱子。
          </div>
        ) : (
          <div className="duo-chart">
            {recentHistory.map((item) => {
              const isToday = item.date === snapshot.date;
              return (
                <div
                  className={clsx("duo-chart-col", { today: isToday })}
                  key={item.date}
                  title={`${item.date} · 累计标记 ${item.marked} 题`}
                >
                  <span className="duo-chart-val">{item.marked}</span>
                  <div className="duo-chart-track">
                    <span
                      className={clsx("duo-chart-bar", {
                        gold: isToday && todayActive,
                      })}
                      style={{
                        height: `${Math.max(6, (item.marked / maxMarked) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="duo-chart-day">{item.date.slice(8)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="duo-card">
        <header className="duo-card-head">
          <h2>成就</h2>
          <span className="meta">
            已解锁 {unlockedCount} / {achievements.length}
          </span>
        </header>
        <div className="duo-achievements">
          {achievements.map(({ icon: Icon, tone, name, desc, goal, value }) => {
            const done = value >= goal;
            const percent = Math.min(100, Math.round((value / goal) * 100));
            return (
              <div
                className={clsx("duo-achievement", { unlocked: done })}
                key={name}
              >
                <span className={clsx("duo-chip", done && tone)}>
                  <Icon aria-hidden size={24} />
                </span>
                <div className="duo-achievement-body">
                  <div className="duo-achievement-text">
                    <strong>{name}</strong>
                    <span>{desc}</span>
                  </div>
                  <div className="duo-bar gold slim">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <span className="duo-achievement-count">
                  {done ? (
                    <LuCheck aria-hidden size={20} />
                  ) : (
                    `${Math.min(value, goal)}/${goal}`
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="duo-card">
        <header className="duo-card-head">
          <h2>练习池进度</h2>
          <span className="meta">
            {snapshot.marked} / {totalPool} · 已启动 {startedPercent}%
          </span>
        </header>
        <div className="duo-stack" role="img" aria-label="练习池进度分布">
          {segments.map((item) => (
            <span
              className="duo-stack-seg"
              key={item.key}
              style={{
                width: `${(item.count / totalPool) * 100}%`,
                background: item.color,
              }}
              title={`${item.label} ${item.count}`}
            />
          ))}
        </div>
        <div className="duo-legend">
          {segments.map((item) => (
            <span className="duo-legend-item" key={item.key}>
              <span className="duo-dot" style={{ background: item.color }} />
              {item.label}
              <strong>{item.count}</strong>
            </span>
          ))}
          <span className="duo-legend-item">
            <span className="duo-dot muted" />
            未开始
            <strong>{unstarted}</strong>
          </span>
        </div>
      </section>

      <section className="duo-card settings-dashboard">
        <header className="duo-card-head">
          <h2>站点设置</h2>
        </header>
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

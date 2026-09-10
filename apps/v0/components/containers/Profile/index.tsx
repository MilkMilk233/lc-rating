"use client";

import { ColorRating } from "@components/RatingCircle";
import Sidebar from "@components/SettingsPanel/Sidebar";
import { setting_tabs } from "@components/SettingsPanel/config";
import { useProgressStore } from "@hooks/useProgressStore";
import { estimateAbility } from "@hooks/useProgressStore/ability";
import {
  activeDates,
  dayKey,
  lastNDays,
  streakDays,
} from "@hooks/useProgressStore/derive";
import { isDue, isGraduated } from "@hooks/useProgressStore/srs";
import { BAND_MINUTES, expectedMinutes } from "@hooks/useProgressStore/pace";
import { useQuestionTags } from "@hooks/useQuestionTags";
import { useZen } from "@hooks/useZen";
import { RATING_BANDS, xpForAttempt } from "@utils/practice";
import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Container, Modal } from "react-bootstrap";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuBadgeCheck,
  LuCalendarCheck,
  LuCheck,
  LuCrown,
  LuFlame,
  LuFootprints,
  LuGem,
  LuLightbulb,
  LuMinus,
  LuMountain,
  LuRocket,
  LuSparkles,
  LuStar,
  LuSwords,
  LuTrendingDown,
  LuTrendingUp,
  LuTrophy,
  LuZap,
} from "react-icons/lu";
import HistoryModal from "./HistoryModal";

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const XP_PER_LEVEL = 120;

const diffDays = (a: string, b: string) => {
  const start = new Date(`${a}T00:00:00`).getTime();
  const end = new Date(`${b}T00:00:00`).getTime();
  return Math.round((end - start) / 86400000);
};

type Tone = "green" | "blue" | "orange" | "gold" | "purple" | "red";

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
  const { tags: questionTags } = useQuestionTags(null);
  const { derived } = useProgressStore();
  const [activeTab, setActiveTab] = useState(setting_tabs[0].key);
  const [showTagBoard, setShowTagBoard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const ActiveSettings = setting_tabs.find(
    (tab) => tab.key === activeTab,
  )?.component;

  const { daily, totals, currentByQid, currentSolved, events, scheduleByQid } =
    derived;

  const today = dayKey(Date.now());
  const activeSet = useMemo(() => activeDates(daily), [daily]);
  const streak = useMemo(() => streakDays(daily, today), [daily, today]);
  const todayActive = activeSet.has(today);

  // question_id -> { rating, hash }, used to join attempts with difficulty
  // and topic tags.
  const zenById = useMemo(() => {
    const map = new Map<string, { rating: number; hash: string }>();
    zen.forEach((question) => {
      map.set(String(question.question_id), {
        rating: question.rating,
        hash: String(question._hash),
      });
    });
    return map;
  }, [zen]);

  const questionById = useMemo(() => {
    const map = new Map<string, { title: string; rating: number }>();
    zen.forEach((question) => {
      map.set(String(question.question_id), {
        title: question.title,
        rating: question.rating,
      });
    });
    return map;
  }, [zen]);

  // XP accumulates over the whole log, so honest effort always earns something.
  const { xp, soloRatings, maxSolvedRating } = useMemo(() => {
    let total = 0;
    const ratings: number[] = [];

    events.forEach((event) => {
      if (event.type !== "attempt") return;
      total += xpForAttempt(event, zenById.get(event.qid)?.rating);
    });

    currentSolved.forEach((attempt) => {
      if (attempt.independence !== "solo") return;
      const rating = zenById.get(attempt.qid)?.rating;
      if (rating != null) ratings.push(rating);
    });

    return {
      xp: total,
      soloRatings: ratings,
      maxSolvedRating: ratings.length > 0 ? Math.max(...ratings) : 0,
    };
  }, [events, currentSolved, zenById]);

  const level = Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
  const levelStart = (level - 1) * XP_PER_LEVEL;
  const xpToNext = levelStart + XP_PER_LEVEL - xp;
  const levelProgress = Math.min(
    100,
    Math.round(((xp - levelStart) / XP_PER_LEVEL) * 100),
  );

  // Capability estimate (per-tag weighted, shared with the recommender).
  // Used only for guidance ("which band fits you"), never to reduce XP.
  const suggestedRating = useMemo(
    () =>
      estimateAbility(
        events,
        (qid) => zenById.get(qid)?.rating,
        (qid) => {
          const hash = zenById.get(qid)?.hash;
          return hash ? questionTags[hash]?.[1] ?? [] : [];
        },
        Date.now(),
      ).global,
    [events, zenById, questionTags],
  );

  const bandStats = useMemo(() => {
    const stats = RATING_BANDS.map((band) => ({ ...band, solved: 0, total: 0 }));
    zen.forEach((question) => {
      const band = stats.find(
        (item) => question.rating >= item.min && question.rating < item.max,
      );
      if (band) band.total += 1;
    });
    currentSolved.forEach((attempt) => {
      const rating = zenById.get(attempt.qid)?.rating;
      if (rating == null) return;
      const band = stats.find(
        (item) => rating >= item.min && rating < item.max,
      );
      if (band) band.solved += 1;
    });
    return stats.filter((band) => band.total > 0);
  }, [zen, currentSolved, zenById]);

  // Weekly output: last 7 calendar days vs the 7 before that.
  const weekly = useMemo(() => {
    const days = lastNDays(daily, 14, today);
    const last7 = days
      .slice(7)
      .reduce((sum, entry) => sum + entry.solved, 0);
    const prev7 = days
      .slice(0, 7)
      .reduce((sum, entry) => sum + entry.solved, 0);
    return { last7, prev7 };
  }, [daily, today]);

  // Topic radar: count solves and struggles per Chinese tag name.
  const tagRadar = useMemo(() => {
    const strength = new Map<string, number>();
    const struggle = new Map<string, number>();

    currentByQid.forEach((attempt, qid) => {
      const hash = zenById.get(qid)?.hash;
      if (!hash) return;
      const zhTags = questionTags[hash]?.[1];
      if (!zhTags) return;

      if (attempt.outcome === "solved") {
        zhTags.forEach((tag) =>
          strength.set(tag, (strength.get(tag) || 0) + 1),
        );
      } else {
        zhTags.forEach((tag) =>
          struggle.set(tag, (struggle.get(tag) || 0) + 1),
        );
      }
    });

    const top = (map: Map<string, number>, min: number, size: number) =>
      Array.from(map.entries())
        .filter(([, count]) => count >= min)
        .sort((a, b) => b[1] - a[1])
        .slice(0, size);

    return {
      strengths: top(strength, 2, 10),
      struggles: top(struggle, 2, 10),
      preview: top(strength, 2, 3),
    };
  }, [currentByQid, zenById, questionTags]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    let count = 0;
    scheduleByQid.forEach((schedule) => {
      if (isDue(schedule, now)) count += 1;
    });
    return count;
  }, [scheduleByQid]);

  // Problems that no longer need review slots — a positive number to show
  // instead of the size of the backlog.
  const graduatedCount = useMemo(() => {
    let count = 0;
    derived.attemptsByQid.forEach((attempts) => {
      if (isGraduated(attempts)) count += 1;
    });
    return count;
  }, [derived]);

  // One nudge at a time: due reviews first, then unfinished business.
  // Deliberately no backlog count — "you have 18 due" is a quitting prompt.
  const nudge = useMemo(() => {
    if (dueCount > 0) {
      return "有几道题到期了，从最急的那道开始复习吧。";
    }
    if (totals.gaveup > 0) {
      return `有 ${totals.gaveup} 道题还没拿下，换个思路再战一次？`;
    }
    if (totals.solved > 0) {
      const next = bandStats.find((band) => band.solved < band.total);
      if (next) {
        return `状态不错！下一关：「${next.label} ${next.range}」，还剩 ${
          next.total - next.solved
        } 道等你征服。`;
      }
    }
    return null;
  }, [dueCount, totals.gaveup, totals.solved, bandStats]);

  const weekDays = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

    return WEEK_LABELS.map((label, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      const key = dayKey(day.getTime());
      return {
        key,
        label,
        active: activeSet.has(key),
        isToday: key === today,
        isFuture: diffDays(today, key) > 0,
      };
    });
  }, [activeSet, today]);

  const todayGain = daily.get(today)?.solved ?? 0;

  const heroTitle =
    streak > 0 ? `${streak} 天连胜` : todayActive ? "今日已打卡" : "点燃小火苗";
  const heroMessage = todayActive
    ? "今天的目标已经达成，小火苗烧得正旺。"
    : streak > 0
      ? "今天还没刷题，别让连胜的小火苗熄灭哦。"
      : totals.marked > 0
        ? "今天完成一道题，重新开始你的连胜。"
        : "记录一道题，从今天开始积累。";
  const heroCta = todayActive
    ? "再刷一题"
    : totals.marked === 0
      ? "去刷第一题"
      : "去刷一题";

  const stats: { icon: IconType; tone: Tone; label: string; value: number }[] =
    [
      { icon: LuBadgeCheck, tone: "green", label: "已解决", value: totals.solved },
      { icon: LuSwords, tone: "blue", label: "没做出来", value: totals.gaveup },
      {
        icon: LuCrown,
        tone: "purple",
        label: "已掌握",
        value: graduatedCount,
      },
      { icon: LuSparkles, tone: "gold", label: "今日新增", value: todayGain },
    ];

  const achievements: Achievement[] = [
    {
      icon: LuFootprints,
      tone: "blue",
      name: "迈出第一步",
      desc: "记录第 1 道题",
      goal: 1,
      value: totals.marked,
    },
    {
      icon: LuBadgeCheck,
      tone: "green",
      name: "首开纪录",
      desc: "解决第 1 道题",
      goal: 1,
      value: totals.solved,
    },
    {
      icon: LuZap,
      tone: "green",
      name: "五题斩",
      desc: "累计解决 5 道题",
      goal: 5,
      value: totals.solved,
    },
    {
      icon: LuMountain,
      tone: "purple",
      name: "挑战自我",
      desc: "解决一道 1600+ 的题",
      goal: 1,
      value: maxSolvedRating >= 1600 ? 1 : 0,
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
      desc: "累计解决 25 道题",
      goal: 25,
      value: totals.solved,
    },
    {
      icon: LuGem,
      tone: "blue",
      name: "半百俱乐部",
      desc: "累计解决 50 道题",
      goal: 50,
      value: totals.solved,
    },
    {
      icon: LuRocket,
      tone: "red",
      name: "登峰造极",
      desc: "解决一道 2100+ 的题",
      goal: 1,
      value: maxSolvedRating >= 2100 ? 1 : 0,
    },
    {
      icon: LuCrown,
      tone: "gold",
      name: "百题斩",
      desc: "累计解决 100 道题",
      goal: 100,
      value: totals.solved,
    },
  ];
  const unlockedCount = achievements.filter(
    (item) => item.value >= item.goal,
  ).length;

  const segments = [
    {
      key: "solved",
      label: "已解决",
      color: "var(--duo-green)",
      count: totals.solved,
    },
    {
      key: "gaveup",
      label: "没做出来",
      color: "var(--duo-orange)",
      count: totals.gaveup,
    },
  ].filter((item) => item.count > 0);
  const totalPool = Math.max(zen.length, totals.marked, 1);
  const startedPercent = Math.round((totals.marked / totalPool) * 100);
  const unstarted = Math.max(0, totalPool - totals.marked);

  const recentDays = useMemo(
    () => lastNDays(daily, 14, today),
    [daily, today],
  );
  const maxDaily = Math.max(...recentDays.map((item) => item.solved), 1);

  // Calibration view: every solved attempt with a known difficulty, plotted
  // against the time a solver fluent at that level would need. If the cloud of
  // dots sits consistently above the curve, the table in pace.ts is optimistic
  // and should be tuned.
  const paceChart = useMemo(() => {
    const points: { rating: number; minutes: number }[] = [];
    events.forEach((event) => {
      if (event.type !== "attempt" || event.outcome !== "solved") return;
      const rating = event.rating ?? zenById.get(event.qid)?.rating;
      if (rating == null) return;
      points.push({ rating, minutes: BAND_MINUTES[event.band] });
    });

    const ratings = points.map((point) => point.rating);
    const minRating = Math.min(1100, ...ratings) - 50;
    const maxRating = Math.max(1700, ...ratings) + 50;
    const maxMinutes = 90;
    const left = 34;
    const right = 592;
    const top = 10;
    const bottom = 140;

    const x = (rating: number) =>
      left + ((rating - minRating) / (maxRating - minRating)) * (right - left);
    const y = (minutes: number) =>
      bottom - (Math.min(minutes, maxMinutes) / maxMinutes) * (bottom - top);

    const curve = Array.from({ length: 25 }, (_, index) => {
      const rating = minRating + (index / 24) * (maxRating - minRating);
      return `${x(rating).toFixed(1)},${y(expectedMinutes(rating)).toFixed(1)}`;
    }).join(" ");

    return { points, x, y, curve };
  }, [events, zenById]);

  const paceSummary = useMemo(() => {
    if (paceChart.points.length < 3) return null;
    const ratios = paceChart.points
      .map((point) => point.minutes / expectedMinutes(point.rating))
      .sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    const percent = Math.round((median - 1) * 100);
    if (percent <= -10) return { label: `比期望快 ${-percent}%` };
    if (percent >= 10) return { label: `比期望慢 ${percent}%` };
    return { label: "耗时基本符合期望" };
  }, [paceChart]);

  const weeklyTrend =
    weekly.last7 > weekly.prev7
      ? { icon: LuTrendingUp, tone: "green" as Tone }
      : weekly.last7 < weekly.prev7
        ? { icon: LuTrendingDown, tone: "orange" as Tone }
        : { icon: LuMinus, tone: "blue" as Tone };

  const maxTagStrength = Math.max(
    ...tagRadar.strengths.map(([, count]) => count),
    1,
  );
  const maxTagStruggle = Math.max(
    ...tagRadar.struggles.map(([, count]) => count),
    1,
  );

  return (
    <Container fluid className="duo-shell page-shell">
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
          <span className="meta">每天解决的题数</span>
        </header>
        {recentDays.every((item) => item.solved === 0) ? (
          <div className="duo-empty">完成一道题，这里就会长出第一根柱子。</div>
        ) : (
          <div className="duo-chart">
            {recentDays.map((item) => {
              const isToday = item.date === today;
              return (
                <div
                  className={clsx("duo-chart-col", { today: isToday })}
                  key={item.date}
                  title={`${item.date} · 解决 ${item.solved} 题`}
                >
                  <span className="duo-chart-val">{item.solved}</span>
                  <div className="duo-chart-track">
                    <span
                      className={clsx("duo-chart-bar", {
                        gold: isToday && todayActive,
                      })}
                      style={{
                        height: `${Math.max(
                          6,
                          (item.solved / maxDaily) * 100,
                        )}%`,
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
          <h2>解题速度 vs 期望</h2>
          <span className="meta">
            {paceSummary ? paceSummary.label : "记录几道题后可见"}
          </span>
        </header>
        {paceChart.points.length < 3 ? (
          <div className="duo-teaser">
            记录至少 3 道带难度分的题，这里会把你每道题的实际耗时和"该难度应有的
            熟练耗时"叠在一起对照。
          </div>
        ) : (
          <>
            <svg
              className="pace-chart"
              viewBox="0 0 600 170"
              role="img"
              aria-label="实际耗时与期望曲线对照"
            >
              <line x1="34" y1="140" x2="592" y2="140" className="pace-axis" />
              <line x1="34" y1="10" x2="34" y2="140" className="pace-axis" />
              {[15, 30, 45, 60, 75].map((minutes) => (
                <g key={minutes}>
                  <line
                    x1="34"
                    x2="592"
                    y1={paceChart.y(minutes)}
                    y2={paceChart.y(minutes)}
                    className="pace-grid"
                  />
                  <text
                    x="30"
                    y={paceChart.y(minutes) + 3}
                    textAnchor="end"
                    className="pace-label"
                  >
                    {minutes}
                  </text>
                </g>
              ))}
              <polyline points={paceChart.curve} className="pace-curve" />
              {paceChart.points.map((point, index) => (
                <circle
                  key={`${point.rating}-${index}`}
                  cx={paceChart.x(point.rating)}
                  cy={paceChart.y(point.minutes)}
                  r="3"
                  className="pace-dot"
                />
              ))}
              {[1200, 1600, 2000, 2400].map((rating) => (
                <text
                  key={rating}
                  x={paceChart.x(rating)}
                  y="156"
                  textAnchor="middle"
                  className="pace-label"
                >
                  {rating}
                </text>
              ))}
            </svg>
            <div className="pace-legend">
              <span>
                <span className="pace-legend-line" />
                期望耗时（按难度拟合）
              </span>
              <span>
                <span className="pace-legend-dot" />
                你的每次解题（{paceChart.points.length} 次）
              </span>
            </div>
          </>
        )}
      </section>

      <section className="duo-card">
        <header className="duo-card-head">
          <h2>练习池进度</h2>
          <span className="meta">
            {totals.marked} / {totalPool} · 已启动 {startedPercent}%
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

        <div className="duo-analytics">
          {totals.solved > 0 ? (
            <div className="duo-bands">
              <div className="duo-subhead">
                难度攻克
                <span>难度越高，经验越多</span>
              </div>
              {bandStats.map((band) => {
                const suggested =
                  suggestedRating >= band.min && suggestedRating < band.max;
                return (
                  <div
                    className={clsx("duo-band", { suggested })}
                    key={band.label}
                  >
                    <div className="duo-band-label">
                      <strong>{band.label}</strong>
                      <span>{band.range}</span>
                      {suggested && <em className="duo-band-tag">适合你</em>}
                    </div>
                    <div className="duo-bar slim">
                      <span
                        style={{
                          width: `${Math.max(
                            band.solved > 0 ? 4 : 0,
                            (band.solved / band.total) * 100,
                          )}%`,
                          background: band.color,
                        }}
                      />
                    </div>
                    <div className="duo-band-meta">
                      <span>
                        <strong>{band.solved}</strong>/{band.total}
                      </span>
                      <span className="duo-band-xp">+{band.xp} XP/题</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="duo-teaser">
              解决第一道题，这里会画出你的难度攻克图。
            </div>
          )}

          {maxSolvedRating > 0 || weekly.last7 > 0 ? (
            <div className="duo-records">
              {maxSolvedRating > 0 && (
                <div className="duo-record">
                  <span className="duo-chip gold">
                    <LuTrophy aria-hidden size={20} />
                  </span>
                  <div>
                    <strong>
                      <ColorRating rating={maxSolvedRating}>
                        {Math.round(maxSolvedRating)}
                      </ColorRating>
                    </strong>
                    <span>最高攻破</span>
                  </div>
                </div>
              )}
              {weekly.last7 > 0 && (
                <div className="duo-record">
                  <span className={`duo-chip ${weeklyTrend.tone}`}>
                    <weeklyTrend.icon aria-hidden size={20} />
                  </span>
                  <div>
                    <strong>+{weekly.last7}</strong>
                    <span title={`前 7 天 +${weekly.prev7}`}>
                      近 7 天新增 · 前 7 天 +{weekly.prev7}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {tagRadar.preview.length > 0 && (
            <div className="duo-tags-preview">
              <span className="duo-subhead-inline">最擅长</span>
              {tagRadar.preview.map(([name, count]) => (
                <span className="duo-tag-chip" key={name}>
                  {name}
                  <strong>×{count}</strong>
                </span>
              ))}
              <button
                type="button"
                className="duo-text-btn"
                onClick={() => setShowTagBoard(true)}
              >
                查看题型榜
              </button>
            </div>
          )}

          {nudge && (
            <div className="duo-nudge">
              <LuLightbulb aria-hidden size={18} />
              <span>{nudge}</span>
            </div>
          )}
        </div>
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

      <Modal
        show={showTagBoard}
        onHide={() => setShowTagBoard(false)}
        centered
        contentClassName="duo-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>题型榜</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="duo-subhead green">最擅长</div>
          {tagRadar.strengths.length === 0 ? (
            <div className="duo-teaser">再解决几道题，这里会生成你的强项。</div>
          ) : (
            tagRadar.strengths.map(([name, count], index) => (
              <div className="tag-rank" key={name}>
                <span className="tag-rank-num">{index + 1}</span>
                <span className="tag-rank-name">{name}</span>
                <div className="duo-bar slim">
                  <span
                    style={{
                      width: `${(count / maxTagStrength) * 100}%`,
                      background: "var(--duo-green)",
                    }}
                  />
                </div>
                <span className="tag-rank-count">{count}</span>
              </div>
            ))
          )}

          <div className="duo-subhead orange">待加强</div>
          {tagRadar.struggles.length === 0 ? (
            <div className="duo-teaser">暂无待加强的题型，保持！</div>
          ) : (
            tagRadar.struggles.map(([name, count], index) => (
              <div className="tag-rank" key={name}>
                <span className="tag-rank-num">{index + 1}</span>
                <span className="tag-rank-name">{name}</span>
                <div className="duo-bar slim">
                  <span
                    style={{
                      width: `${(count / maxTagStruggle) * 100}%`,
                      background: "var(--duo-orange)",
                    }}
                  />
                </div>
                <span className="tag-rank-count">{count}</span>
              </div>
            ))
          )}
        </Modal.Body>
      </Modal>

      <HistoryModal
        show={showHistory}
        onHide={() => setShowHistory(false)}
        questionById={questionById}
      />

      <section className="duo-card settings-dashboard">
        <header className="duo-card-head">
          <h2>站点设置</h2>
          <button
            type="button"
            className="duo-text-btn"
            onClick={() => setShowHistory(true)}
          >
            记录管理
          </button>
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

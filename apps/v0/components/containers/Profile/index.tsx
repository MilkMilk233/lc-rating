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
import { useEffect, useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import {
  LuBadgeCheck,
  LuChartNoAxesColumnIncreasing,
  LuCircleDot,
  LuFlame,
  LuSettings,
  LuTarget,
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

  return (
    <Container fluid className="profile page-shell">
      <header className="page-heading profile-heading">
        <div>
          <p className="eyebrow">Profile</p>
          <h1 className="page-title">个人进度</h1>
          <p className="page-description">
            这里使用当前浏览器的本地进度缓存。每天第一次打开或更新进度时，会记录一条本地趋势快照。
          </p>
        </div>
        <div className="profile-score">
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
            <span className="profile-score-label">Solved</span>
            <strong>
              {snapshot.ac} / {totalPool}
            </strong>
          </div>
        </div>
      </header>

      <section className="profile-grid">
        <div className="profile-card metric-card">
          <LuBadgeCheck aria-hidden size={22} />
          <span>已通过</span>
          <strong>{snapshot.ac}</strong>
        </div>
        <div className="profile-card metric-card">
          <LuFlame aria-hidden size={22} />
          <span>攻略中</span>
          <strong>{snapshot.working}</strong>
        </div>
        <div className="profile-card metric-card">
          <LuCircleDot aria-hidden size={22} />
          <span>已标记</span>
          <strong>{snapshot.marked}</strong>
        </div>
        <div className="profile-card metric-card">
          <LuTarget aria-hidden size={22} />
          <span>启动率</span>
          <strong>{startedPercent}%</strong>
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

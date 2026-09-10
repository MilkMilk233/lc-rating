// Persistence for the progress log.
//
// Layout: a single localStorage key holding the whole document. Writes are
// read-merge-write: we re-read the current document right before writing and
// merge by event id, which keeps concurrent tabs from clobbering each other.
//
// This module is the only place that knows about localStorage. Swapping the
// backend (IndexedDB, sharded keys, ...) should not touch the rest of the app.

import {
  isEffortBand,
  isGaveUpReason,
  isIndependence,
} from "./bands";
import { mergeEvents } from "./derive";
import type {
  AttemptEvent,
  GaveUpAttempt,
  ProgressEvent,
  ProgressStoreV2,
  SolvedAttempt,
} from "./types";

export const STORAGE_KEY = "lc-rating-progress-v2";

/** Keys from the pre-v2 layout; cleaned up once so they stop taking space. */
export const LEGACY_PROGRESS_PREFIX = "lc-rating-zen-progress-";
export const LEGACY_PROGRESS_KEYS = [
  "lc-rating-progress-history",
  "lc-rating-progress-config",
  // v1 zen filter settings, superseded by lc-rating-zen-settings-v2.
  "lc-rating-zen-settings",
];

const isBrowser = () => typeof window !== "undefined";

export function emptyStore(): ProgressStoreV2 {
  return { version: 2, installedAt: Date.now(), events: [] };
}

export function validateEvent(raw: unknown): AttemptEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.length === 0) return null;
  if (e.type !== "attempt") return null;
  if (typeof e.qid !== "string" || e.qid.length === 0) return null;
  if (typeof e.at !== "number" || !Number.isFinite(e.at)) return null;

  const src = typeof e.src === "string" && e.src.length > 0 ? e.src : "zen";

  if (e.outcome === "solved") {
    if (!isEffortBand(e.band)) return null;
    if (!isIndependence(e.independence)) return null;
    // Spread first so fields written by a newer client survive a round-trip.
    return {
      ...(e as unknown as SolvedAttempt),
      id: e.id,
      type: "attempt",
      qid: e.qid,
      at: e.at,
      src,
      outcome: "solved",
      band: e.band,
      independence: e.independence,
      // Only ever true or absent, so the flag cannot be set to junk on import.
      revisit: e.revisit === true ? true : undefined,
    };
  }

  if (e.outcome === "gaveup") {
    if (!isGaveUpReason(e.reason)) return null;
    return {
      ...(e as unknown as GaveUpAttempt),
      id: e.id,
      type: "attempt",
      qid: e.qid,
      at: e.at,
      src,
      outcome: "gaveup",
      reason: e.reason,
    };
  }

  return null;
}

interface ExtractResult {
  events: ProgressEvent[];
  invalid: number;
}

function extractEvents(raw: unknown): ExtractResult | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)
      ? ((raw as { events: unknown[] }).events)
      : null;
  if (!list) return null;

  const events: ProgressEvent[] = [];
  let invalid = 0;
  for (const item of list) {
    const event = validateEvent(item);
    if (event) events.push(event);
    else invalid += 1;
  }
  return { events, invalid };
}

function installedAtOf(raw: unknown): number {
  if (raw && typeof raw === "object") {
    const value = (raw as { installedAt?: unknown }).installedAt;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return Date.now();
}

/** Load the persisted document, dropping malformed events instead of failing. */
export function loadStore(): ProgressStoreV2 {
  if (!isBrowser()) return emptyStore();

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStore();

  try {
    const parsed: unknown = JSON.parse(raw);
    const extracted = extractEvents(parsed);
    if (!extracted) return emptyStore();
    return {
      version: 2,
      installedAt: installedAtOf(parsed),
      events: mergeEvents(extracted.events),
    };
  } catch (error) {
    console.error("[progress] failed to read stored data:", error);
    return emptyStore();
  }
}

/**
 * Apply a mutation to the freshest stored document and persist the result.
 * Re-reading before writing is what makes concurrent tabs safe: any event the
 * other tab appended between our render and this write is preserved.
 */
export function mutateStore(
  mutator: (current: ProgressStoreV2) => ProgressStoreV2,
): ProgressStoreV2 {
  const current = loadStore();
  const draft = mutator(current);
  const next: ProgressStoreV2 = {
    version: 2,
    installedAt: current.installedAt || Date.now(),
    events: mergeEvents(draft.events),
  };

  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("[progress] failed to persist data:", error);
    }
  }

  return next;
}

/** Remove the pre-v2 keys once. Returns how many keys were removed. */
export function cleanupLegacyKeys(): number {
  if (!isBrowser()) return 0;

  const storage = window.localStorage;
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(LEGACY_PROGRESS_PREFIX)) doomed.push(key);
  }
  for (const key of LEGACY_PROGRESS_KEYS) {
    if (storage.getItem(key) !== null) doomed.push(key);
  }

  let removed = 0;
  for (const key of doomed) {
    storage.removeItem(key);
    removed += 1;
  }
  if (removed > 0) {
    console.info(`[progress] removed ${removed} legacy key(s)`);
  }
  return removed;
}

export interface ExportPayload {
  version: 2;
  exportedAt: number;
  installedAt: number;
  events: ProgressEvent[];
}

export function buildExport(store: ProgressStoreV2): string {
  const payload: ExportPayload = {
    version: 2,
    exportedAt: Date.now(),
    installedAt: store.installedAt,
    events: store.events,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportParseResult {
  ok: boolean;
  error?: string;
  events: ProgressEvent[];
  /** Entries that failed validation. */
  invalid: number;
}

function looksLikeV1Map(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every(
    (key) => /^\d+$/.test(key) && typeof value[key] === "string",
  );
}

/**
 * Parse an exported file. Accepts the v2 envelope or a bare event array; the
 * pre-v2 `{ "1": "AC" }` map is rejected with a clear message.
 */
export function parseImport(json: string): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON 解析失败", events: [], invalid: 0 };
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.events)) {
      const extracted = extractEvents(record);
      return { ok: true, events: extracted?.events ?? [], invalid: extracted?.invalid ?? 0 };
    }
    if (looksLikeV1Map(record)) {
      return {
        ok: false,
        error: "检测到旧版（v1）进度格式，已不再支持导入",
        events: [],
        invalid: 0,
      };
    }
  }

  const extracted = extractEvents(parsed);
  if (extracted) {
    return { ok: true, events: extracted.events, invalid: extracted.invalid };
  }

  return { ok: false, error: "无法识别的数据格式", events: [], invalid: 0 };
}

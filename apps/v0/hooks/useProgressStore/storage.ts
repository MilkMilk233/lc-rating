// Persistence for the progress log.
//
// Layout: a single localStorage key holding the whole document. Writes are
// read-merge-write: we re-read the current document right before writing and
// merge by event id, which keeps concurrent tabs from clobbering each other.
//
// This module is the only place that knows about localStorage. Swapping the
// backend (IndexedDB, sharded keys, ...) should not touch the rest of the app.

import type { MessageKey } from "@hooks/useI18n/messages";
import { BAND_MINUTES } from "./pace";
import {
  isEffortBand,
  isGaveUpReason,
  isIndependence,
} from "./bands";
import { mergeEvents } from "./derive";
import type {
  EffortBand,
  GaveUpAttempt,
  ProgressEvent,
  ProgressStore,
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

export function emptyStore(): ProgressStore {
  return { version: 3, installedAt: Date.now(), events: [] };
}

/**
 * Convert one v2 attempt to v3.
 *
 * - the felt band becomes the duration it stood for (`BAND_MINUTES`), marked
 *   `timed: false` because it was never measured; the estimator gives such
 *   records a wider error term, and validation can exclude them entirely
 * - "solved with the editorial" was never a solve, so it becomes a give-up
 *   whose reason is `saw_solution`
 * - "had an idea but too tedious" carried no monotone signal about ability and
 *   is now expressed by dismissing a problem, so those attempts are dropped
 *
 * Returns null for events with no v3 equivalent.
 */
export function migrateV2Event(raw: unknown): ProgressEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.type !== "attempt") return null;

  const imputed = { minutes: minutesOfV2(e), imputed: true as const, band: undefined };

  if (e.outcome === "solved" && e.independence === "solution") {
    return validateEvent({
      ...e,
      ...imputed,
      outcome: "gaveup",
      reason: "saw_solution",
      independence: undefined,
    });
  }
  if (e.outcome === "gaveup" && e.reason === "idea_tedious") return null;

  return validateEvent({ ...e, ...imputed });
}

function minutesOfV2(e: Record<string, unknown>): number | undefined {
  if (typeof e.minutes === "number" && Number.isFinite(e.minutes)) return e.minutes;
  return typeof e.band === "string" && e.band in BAND_MINUTES
    ? BAND_MINUTES[e.band as EffortBand]
    : undefined;
}

export function validateEvent(raw: unknown): ProgressEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.length === 0) return null;
  if (typeof e.at !== "number" || !Number.isFinite(e.at)) return null;

  // Question ids arrive as JSON numbers from zenk.json but are stored as
  // strings, so coerce instead of rejecting: dropping the event would silently
  // lose a recorded attempt on the next reload.
  const qid =
    typeof e.qid === "string"
      ? e.qid
      : typeof e.qid === "number" && Number.isFinite(e.qid)
        ? String(e.qid)
        : "";
  if (qid.length === 0) return null;

  if (e.type === "dismiss") {
    return { id: e.id, type: "dismiss", qid, at: e.at };
  }
  if (e.type !== "attempt") return null;

  const src = typeof e.src === "string" && e.src.length > 0 ? e.src : "zen";
  const rating =
    typeof e.rating === "number" && Number.isFinite(e.rating)
      ? e.rating
      : undefined;
  const minutes =
    typeof e.minutes === "number" && Number.isFinite(e.minutes) && e.minutes >= 0
      ? e.minutes
      : null;
  const timed = e.timed === true ? (true as const) : undefined;
  const imputed = e.imputed === true ? (true as const) : undefined;
  // v3 derives the band from the duration, so a leftover v2 `band` is dropped
  // rather than carried along as a second, possibly disagreeing, source.
  const { band: _legacyBand, ...rest } = e;

  if (e.outcome === "solved") {
    if (minutes == null) return null;
    if (!isIndependence(e.independence)) return null;
    // Spread first so fields written by a newer client survive a round-trip.
    return {
      ...(rest as unknown as SolvedAttempt),
      id: e.id,
      type: "attempt",
      qid,
      at: e.at,
      src,
      rating,
      outcome: "solved",
      minutes,
      timed,
      imputed,
      independence: e.independence,
      // Only ever true or absent, so the flag cannot be set to junk on import.
      revisit: e.revisit === true ? true : undefined,
    };
  }

  if (e.outcome === "gaveup") {
    if (minutes == null) return null;
    if (!isGaveUpReason(e.reason)) return null;
    return {
      ...(rest as unknown as GaveUpAttempt),
      id: e.id,
      type: "attempt",
      qid,
      at: e.at,
      src,
      rating,
      outcome: "gaveup",
      minutes,
      timed,
      imputed,
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
    // v2 records are converted on the way in, so the rest of the app only ever
    // sees one shape. An attempt the conversion drops counts as invalid rather
    // than silently disappearing.
    const event = validateEvent(item) ?? migrateV2Event(item);
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
export function loadStore(): ProgressStore {
  if (!isBrowser()) return emptyStore();

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyStore();

  try {
    const parsed: unknown = JSON.parse(raw);
    const extracted = extractEvents(parsed);
    if (!extracted) return emptyStore();
    return {
      version: 3,
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
  mutator: (current: ProgressStore) => ProgressStore,
): ProgressStore {
  const current = loadStore();
  const draft = mutator(current);
  const next: ProgressStore = {
    version: 3,
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
  version: 3;
  exportedAt: number;
  installedAt: number;
  events: ProgressEvent[];
}

export function buildExport(store: ProgressStore): string {
  const payload: ExportPayload = {
    version: 3,
    exportedAt: Date.now(),
    installedAt: store.installedAt,
    events: store.events,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportParseResult {
  ok: boolean;
  /** Message key, not finished text: the caller owns the locale. */
  errorKey?: MessageKey;
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
    return { ok: false, errorKey: "import.badJson", events: [], invalid: 0 };
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
        errorKey: "import.legacyV1",
        events: [],
        invalid: 0,
      };
    }
  }

  const extracted = extractEvents(parsed);
  if (extracted) {
    return { ok: true, events: extracted.events, invalid: extracted.invalid };
  }

  return { ok: false, errorKey: "import.unknownFormat", events: [], invalid: 0 };
}

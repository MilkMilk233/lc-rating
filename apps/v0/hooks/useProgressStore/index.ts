// Progress store: the React-facing API over the event log.
//
// UI code should only talk to this module (and the projections it returns), so
// that persistence and schema details stay contained in the data layer.

import type { MessageKey } from "@hooks/useI18n/messages";
import { useMemo, useSyncExternalStore } from "react";
import { deriveProgress } from "./derive";
import type { DerivedProgress } from "./derive";
import {
  buildExport,
  cleanupLegacyKeys,
  loadStore,
  mutateStore,
  parseImport,
  STORAGE_KEY,
} from "./storage";
import type {
  AttemptEvent,
  AttemptSource,
  EffortBand,
  GaveUpReason,
  Independence,
  ProgressStore as ProgressDocument,
} from "./types";

export type LogAttemptInput =
  | {
      qid: string;
      outcome: "solved";
      /** How long the attempt took. The felt band is derived from it. */
      minutes: number;
      /** True when `minutes` came from the tracker rather than from the user. */
      timed?: boolean;
      independence?: Independence;
      /** Drill mode: something here is worth memorising. */
      revisit?: boolean;
      /** Problem difficulty at the time of the attempt. */
      rating?: number;
      at?: number;
      src?: AttemptSource;
    }
  | {
      qid: string;
      outcome: "gaveup";
      minutes: number;
      timed?: boolean;
      reason: GaveUpReason;
      rating?: number;
      at?: number;
      src?: AttemptSource;
    };

export interface ImportResult {
  ok: boolean;
  /** Message key; the caller renders it in the active locale. */
  errorKey?: MessageKey;
  imported: number;
  duplicates: number;
  invalid: number;
}

/** Stable snapshot used during SSR/hydration, before localStorage is readable. */
const SERVER_SNAPSHOT: ProgressDocument = {
  version: 3,
  installedAt: 0,
  events: [],
};

function makeEventId(qid: string, at: number): string {
  return `${qid}-${at}-${Math.random().toString(36).slice(2, 8)}`;
}

class ProgressStore {
  private state: ProgressDocument = SERVER_SNAPSHOT;
  private listeners = new Set<() => void>();
  private lastLoggedId: string | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    cleanupLegacyKeys();
    this.state = loadStore();
    window.addEventListener("storage", this.handleStorage);
  }

  getSnapshot = (): ProgressDocument => this.state;

  getServerSnapshot = (): ProgressDocument => SERVER_SNAPSHOT;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  private handleStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    this.state = loadStore();
    this.notify();
  };

  logAttempt = (input: LogAttemptInput): AttemptEvent => {
    const at = input.at ?? Date.now();
    // Callers hand over `question_id` straight from zenk.json, where it is a
    // JSON number. Every id in the store is a string, so normalise here rather
    // than trusting each call site.
    const qid = String(input.qid);
    const base = {
      id: makeEventId(qid, at),
      type: "attempt" as const,
      qid,
      at,
      src: input.src ?? "recommend",
      minutes: Math.max(0, Math.round(input.minutes)),
      ...(input.timed ? { timed: true as const } : {}),
      ...(typeof input.rating === "number" ? { rating: input.rating } : {}),
    };
    const event: AttemptEvent =
      input.outcome === "solved"
        ? {
            ...base,
            outcome: "solved",
            independence: input.independence ?? "solo",
            ...(input.revisit ? { revisit: true as const } : {}),
          }
        : { ...base, outcome: "gaveup", reason: input.reason };

    this.state = mutateStore((current) => ({
      ...current,
      events: [...current.events, event],
    }));
    this.lastLoggedId = event.id;
    this.notify();
    return event;
  };

  /**
   * Never offer this question again.
   *
   * Stored as an event rather than a flag so it survives export/import and can
   * be revoked by deleting it, and so "the latest event wins" already handles
   * reviving a question that is attempted later.
   */
  dismiss = (qid: string, src: AttemptSource = "recommend"): void => {
    const at = Date.now();
    this.state = mutateStore((current) => ({
      ...current,
      events: [
        ...current.events,
        { id: makeEventId(String(qid), at), type: "dismiss", qid: String(qid), at },
      ],
    }));
    this.notify();
  };

  /** Undo the most recent attempt logged in this session. */
  undoLast = (): boolean => {
    if (!this.lastLoggedId) return false;
    const removed = this.removeAttempts([this.lastLoggedId]);
    if (removed > 0) this.lastLoggedId = null;
    return removed > 0;
  };

  removeAttempts = (ids: string[]): number => {
    const doomed = new Set(ids);
    if (doomed.size === 0) return 0;

    let removed = 0;
    this.state = mutateStore((current) => ({
      ...current,
      events: current.events.filter((event) => {
        if (!doomed.has(event.id)) return true;
        removed += 1;
        return false;
      }),
    }));
    this.notify();
    return removed;
  };

  exportData = (): string => buildExport(this.state);

  importData = (json: string): ImportResult => {
    const parsed = parseImport(json);
    if (!parsed.ok) {
      return {
        ok: false,
        errorKey: parsed.errorKey,
        imported: 0,
        duplicates: 0,
        invalid: parsed.invalid,
      };
    }

    const existing = new Set(this.state.events.map((event) => event.id));
    const fresh = parsed.events.filter((event) => !existing.has(event.id));
    const duplicates = parsed.events.length - fresh.length;

    this.state = mutateStore((current) => ({
      ...current,
      events: [...current.events, ...fresh],
    }));
    this.notify();

    return { ok: true, imported: fresh.length, duplicates, invalid: parsed.invalid };
  };
}

const store = new ProgressStore();

export function useProgressStore() {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  const derived: DerivedProgress = useMemo(
    () => deriveProgress(snapshot.events),
    [snapshot],
  );

  return {
    store: snapshot,
    derived,
    logAttempt: store.logAttempt,
    dismiss: store.dismiss,
    undoLast: store.undoLast,
    removeAttempts: store.removeAttempts,
    exportData: store.exportData,
    importData: store.importData,
  };
}

export * from "./types";
export * from "./bands";
export * from "./srs";
export * from "./derive";

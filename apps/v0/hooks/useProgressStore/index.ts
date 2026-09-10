// Progress store: the React-facing API over the event log.
//
// UI code should only talk to this module (and the projections it returns), so
// that persistence and schema details stay contained in the data layer.

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
  ProgressStoreV2,
} from "./types";

export type LogAttemptInput =
  | {
      qid: string;
      outcome: "solved";
      band: EffortBand;
      independence?: Independence;
      /** Drill mode: something here is worth memorising. */
      revisit?: boolean;
      at?: number;
      src?: AttemptSource;
    }
  | {
      qid: string;
      outcome: "gaveup";
      reason: GaveUpReason;
      at?: number;
      src?: AttemptSource;
    };

export interface ImportResult {
  ok: boolean;
  error?: string;
  imported: number;
  duplicates: number;
  invalid: number;
}

/** Stable snapshot used during SSR/hydration, before localStorage is readable. */
const SERVER_SNAPSHOT: ProgressStoreV2 = {
  version: 2,
  installedAt: 0,
  events: [],
};

function makeEventId(qid: string, at: number): string {
  return `${qid}-${at}-${Math.random().toString(36).slice(2, 8)}`;
}

class ProgressStore {
  private state: ProgressStoreV2 = SERVER_SNAPSHOT;
  private listeners = new Set<() => void>();
  private lastLoggedId: string | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    cleanupLegacyKeys();
    this.state = loadStore();
    window.addEventListener("storage", this.handleStorage);
  }

  getSnapshot = (): ProgressStoreV2 => this.state;

  getServerSnapshot = (): ProgressStoreV2 => SERVER_SNAPSHOT;

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
    const base = {
      id: makeEventId(input.qid, at),
      type: "attempt" as const,
      qid: input.qid,
      at,
      src: input.src ?? "recommend",
    };
    const event: AttemptEvent =
      input.outcome === "solved"
        ? {
            ...base,
            outcome: "solved",
            band: input.band,
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
        error: parsed.error,
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

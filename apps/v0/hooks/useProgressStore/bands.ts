// Display metadata for the effort bands and gave-up reasons.
//
// This is the single source of truth for user-facing wording. Events only ever
// store the stable `key`, so labels can be reworded without touching stored
// data.

import type {
  AttemptEvent,
  EffortBand,
  GaveUpReason,
  Independence,
} from "./types";

export interface BandMeta {
  key: EffortBand;
  /** Duration anchor shown as the primary label. */
  label: string;
  /** Short "how it felt" hint. */
  hint: string;
  /** 0 = easiest. Used for ordering and for the record panel. */
  order: number;
}

export const EFFORT_BANDS: readonly BandMeta[] = [
  { key: "LE5", label: "≤5min", hint: "秒了", order: 0 },
  { key: "L5_15", label: "5–15min", hint: "顺手", order: 1 },
  { key: "L15_30", label: "15–30min", hint: "想了想", order: 2 },
  { key: "L30_60", label: "30–60min", hint: "很艰难", order: 3 },
  { key: "GT60", label: ">60min", hint: "差点没做出来", order: 4 },
];

export const BAND_ORDER: readonly EffortBand[] = EFFORT_BANDS.map(
  (band) => band.key,
);

const BAND_MAP: Record<EffortBand, BandMeta> = EFFORT_BANDS.reduce(
  (acc, band) => {
    acc[band.key] = band;
    return acc;
  },
  {} as Record<EffortBand, BandMeta>,
);

export function bandMeta(key: EffortBand): BandMeta {
  return BAND_MAP[key] ?? EFFORT_BANDS[0];
}

export function isEffortBand(value: unknown): value is EffortBand {
  return typeof value === "string" && value in BAND_MAP;
}

export interface ReasonMeta {
  key: GaveUpReason;
  label: string;
}

export const GAVEUP_REASONS: readonly ReasonMeta[] = [
  { key: "idea_tedious", label: "有思路，但太繁琐不想做" },
  { key: "no_idea", label: "完全没思路" },
];

const REASON_MAP: Record<GaveUpReason, ReasonMeta> = GAVEUP_REASONS.reduce(
  (acc, reason) => {
    acc[reason.key] = reason;
    return acc;
  },
  {} as Record<GaveUpReason, ReasonMeta>,
);

export function gaveUpReasonMeta(key: GaveUpReason): ReasonMeta {
  return REASON_MAP[key] ?? GAVEUP_REASONS[0];
}

export function isGaveUpReason(value: unknown): value is GaveUpReason {
  return typeof value === "string" && value in REASON_MAP;
}

export interface IndependenceMeta {
  key: Independence;
  label: string;
}

export const INDEPENDENCE_OPTIONS: readonly IndependenceMeta[] = [
  { key: "solo", label: "独立完成" },
  { key: "solution", label: "参考了题解" },
];

export function isIndependence(value: unknown): value is Independence {
  return value === "solo" || value === "solution";
}

/** One-line human label for a question's latest attempt. */
export function attemptLabel(event: AttemptEvent | undefined): string {
  if (!event) return "未记录";
  if (event.outcome === "solved") {
    const mode = event.independence === "solo" ? "独立" : "参考题解";
    return `${bandMeta(event.band).label} · ${mode}`;
  }
  return `没做出来 · ${gaveUpReasonMeta(event.reason).label}`;
}

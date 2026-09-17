// Structural metadata for the effort bands and gave-up reasons.
//
// The wording itself lives in hooks/useI18n/messages, because it has to exist
// in more than one language; this module owns the stable keys, the ordering and
// the key builders that map an enum value onto its message. Events only ever
// store the key, so labels can be reworded without touching stored data.

import type { MessageKey, Translate } from "@hooks/useI18n/messages";
import type {
  AttemptEvent,
  EffortBand,
  GaveUpReason,
  Independence,
} from "./types";

export interface BandMeta {
  key: EffortBand;
  /** 0 = easiest. Used for ordering and for the record panel. */
  order: number;
}

export const EFFORT_BANDS: readonly BandMeta[] = [
  { key: "LE5", order: 0 },
  { key: "L5_15", order: 1 },
  { key: "L15_30", order: 2 },
  { key: "L30_60", order: 3 },
  { key: "GT60", order: 4 },
];

/** Duration anchor, e.g. "5–15min". */
export const bandLabelKey = (band: EffortBand): MessageKey => `band.${band}`;
/** Short "how it felt" hint shown next to the label. */
export const bandHintKey = (band: EffortBand): MessageKey =>
  `band.${band}.hint`;

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
}

export const GAVEUP_REASONS: readonly ReasonMeta[] = [
  { key: "idea_tedious" },
  { key: "no_idea" },
];

export const gaveUpReasonKey = (reason: GaveUpReason): MessageKey =>
  `gaveup.${reason}`;

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
}

export const INDEPENDENCE_OPTIONS: readonly IndependenceMeta[] = [
  { key: "solo" },
  { key: "solution" },
];

export const independenceKey = (value: Independence): MessageKey =>
  `independence.${value}`;

export function isIndependence(value: unknown): value is Independence {
  return value === "solo" || value === "solution";
}

/** One-line human label for a question's latest attempt. */
export function attemptLabel(
  event: AttemptEvent | undefined,
  t: Translate,
): string {
  if (!event) return t("attempt.none");
  if (event.outcome === "solved") {
    const base = t("attempt.solved", {
      band: t(bandLabelKey(event.band)),
      mode: t(
        event.independence === "solo"
          ? "attempt.mode.solo"
          : "attempt.mode.solution",
      ),
    });
    return event.revisit === true ? t("attempt.drill", { base }) : base;
  }
  return t("attempt.gaveup", { reason: t(gaveUpReasonKey(event.reason)) });
}

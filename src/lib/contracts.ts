import { z } from 'zod';

/* ---------------------------------- Beats ---------------------------------- */

export const BEAT_TYPES = [
  'HOOK',
  'SETUP',
  'ESCALATION',
  'REVEAL',
  'TWIST',
  'CONFLICT',
  'BREATH',
  'CLIFFHANGER',
] as const;
export type BeatType = (typeof BEAT_TYPES)[number];

export const TIME_OF_DAY = ['DAWN', 'DAY', 'DUSK', 'NIGHT'] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export const BeatSchema = z.object({
  index: z.number().int().min(0),
  title: z.string().min(1),
  type: z.enum(BEAT_TYPES),
  location: z.string().min(1),
  timeOfDay: z.enum(TIME_OF_DAY),
  durationSec: z.number().min(3).max(30),
  cast: z.array(z.string()).default([]), // character NAMES (resolved against bible)
  props: z
    .array(z.object({ ref: z.string(), action: z.enum(['INTRODUCE', 'USE', 'DROP']) }))
    .default([]),
  wardrobe: z.record(z.string(), z.string()).default({}), // charName -> outfit tag
  loreAssertions: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  visualPrompt: z.string().default(''),
  dialogue: z
    .array(
      z.object({
        char: z.string(),
        line: z.string(),
        emotion: z.string().default('neutral'),
      })
    )
    .default([]),
  purpose: z.string().default(''),
  qualitySelfScore: z.number().min(0).max(1).default(0.6),
});
export type Beat = z.infer<typeof BeatSchema>;

export const BeatPlanSchema = z.object({
  beats: z.array(BeatSchema).min(4).max(14),
  summary: z.string().default(''),
});
export type BeatPlan = z.infer<typeof BeatPlanSchema>;

/* ------------------------------ Compile report ----------------------------- */

export const RULES = [
  'C1-CAST',
  'C2-PRESENCE',
  'C3-TIMELINE',
  'C4-PROP',
  'C5-WARDROBE',
  'C6-LORE',
  'C7-BUDGET',
  'C8-DURATION',
] as const;
export type Rule = (typeof RULES)[number];

export interface Violation {
  rule: Rule;
  beatIndex: number;
  message: string;
  fixSuggestion: string;
  severity: 'ERROR' | 'WARN';
}

export interface CompileReport {
  status: 'PASS' | 'WARN' | 'FAIL';
  estimatedCostUsd: number;
  violations: Violation[];
}

/* --------------------------------- Personas -------------------------------- */

export const ViewerPersonaSchema = z.object({
  name: z.string(),
  archetype: z.string(),
  age: z.number().int(),
  occupation: z.string(),
  affinities: z.record(z.enum(BEAT_TYPES), z.number().min(0).max(1)),
  attentionSpanBeats: z.number().int().min(3).max(14),
  churnThreshold: z.number().min(0.15).max(0.7),
  loyalty: z.number().min(0).max(1),
  commentProbability: z.number().min(0).max(1),
  seed: z.number().int(),
});
export type ViewerPersona = z.infer<typeof ViewerPersonaSchema>;

/* -------------------------------- Screening -------------------------------- */

export interface WatchEvent {
  beat: number;
  s: number;
  S: number;
  recalled: string[];
}

/* --------------------------------- Helpers --------------------------------- */

export function jparse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function jstring(v: unknown): string {
  return JSON.stringify(v);
}

export function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Retrievability of an FSRS-style memory after `deltaEp` episodes. */
export function retrievability(stability: number, deltaEp: number): number {
  return Math.exp(-Math.max(0, deltaEp) / (0.9 * Math.max(0.1, stability)));
}

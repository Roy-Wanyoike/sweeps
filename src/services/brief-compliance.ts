import { db } from '@/lib/db';
import { Beat, jparse } from '@/lib/contracts';
import { knownLocationsForArm, BriefCheck, BriefDirective, WriterBrief } from './arc';

/**
 * Directive-compliance verifier — the deterministic half of the loop closure.
 *
 * The writer is probabilistic (LLM) or deterministic (fallback); either way the
 * checker re-reads the EXACT brief snapshot stored on the episode and PROVES,
 * per directive, whether the final beat plan honors its machine contract:
 *
 *   CALLBACK      — a thread title appears verbatim within the first N beats
 *   HOOK          — beat 0 re-states the previous cliffhanger
 *   PROTECT_BEAT  — no first-half beat exceeds the churn-derived length cap
 *   COHORT        — a first-half beat carries ≥ N concrete details
 *   ECONOMY       — ≥ x% of beats reuse already-established locations
 *
 * Zero AI, zero writes: same plan + same brief → same verdict, every time.
 */

export interface ComplianceRow {
  kind: BriefDirective['kind'];
  title: string;
  honored: boolean;
  /** informational directives (no machine contract) verify nothing */
  informational: boolean;
  evidence: string;
}

export interface BriefCompliance {
  episodeId: string;
  episodeNumber: number;
  arm: string;
  briefFingerprint: string | null;
  cohort: string | null;
  rows: ComplianceRow[];
  honoredCount: number;
  /** honored among machine-checkable directives only (informational excluded) */
  honoredCheckable: number;
  checkable: number;
  total: number;
  allHonored: boolean;
}

export interface VerifyOutcome {
  rows: ComplianceRow[];
  honoredCount: number;
  honoredCheckable: number;
  checkable: number;
  total: number;
  allHonored: boolean;
}

/**
 * Pure core of the verifier: one brief + one plan (+ the arm's established
 * locations) → per-directive verdict. Used by BOTH the stored-episode receipt
 * (verifyBriefCompliance) and the what-if simulator's pre-flight check, so the
 * two can never drift.
 */
export async function verifyPlanAgainstBrief(
  brief: WriterBrief,
  beats: Beat[],
  knownLocations: Set<string>
): Promise<VerifyOutcome> {
  const rows: ComplianceRow[] = [];

  for (const d of brief.directives) {
    if (!d.check) {
      rows.push({
        kind: d.kind,
        title: d.title,
        honored: true,
        informational: true,
        evidence: 'informational directive — nothing to verify',
      });
      continue;
    }
    switch (d.check.type) {
      case 'CALLBACK': {
        const threadTitle = d.check.threadTitle;
        const n = Math.min(d.check.withinFirstNBeats, beats.length);
        const idx = beats.slice(0, n).findIndex((b) => mentions(textOf(b), threadTitle));
        rows.push({
          kind: d.kind,
          title: d.title,
          honored: idx !== -1,
          informational: false,
          evidence:
            idx !== -1
              ? `beat ${idx} references "${threadTitle}" within the first ${n} beats`
              : `"${threadTitle}" not found in the first ${n} beats`,
        });
        break;
      }
      case 'HOOK': {
        const honored = beats.length > 0 && mentions(textOf(beats[0]), d.check.cliffhangerTitle);
        rows.push({
          kind: d.kind,
          title: d.title,
          honored,
          informational: false,
          evidence: honored
            ? `beat 0 re-states "${d.check.cliffhangerTitle}"`
            : `beat 0 never re-states "${d.check.cliffhangerTitle}"`,
        });
        break;
      }
      case 'PROTECT_BEAT': {
        const cap = d.check.maxFirstHalfSec;
        const half = Math.max(1, Math.ceil(beats.length / 2));
        const firstHalf = beats.slice(0, half);
        const longest = Math.max(...firstHalf.map((b) => b.durationSec));
        const overIdx = firstHalf.findIndex((b) => b.durationSec > cap);
        const honored = overIdx === -1;
        rows.push({
          kind: d.kind,
          title: d.title,
          honored,
          informational: false,
          evidence: honored
            ? `longest first-half beat ${longest}s ≤ ${cap}s cap`
            : `beat ${overIdx} runs ${firstHalf[overIdx].durationSec}s > ${cap}s cap`,
        });
        break;
      }
      case 'COHORT': {
        const half = Math.max(1, Math.ceil(beats.length / 2));
        const firstHalf = beats.slice(0, half);
        const densities = firstHalf.map((b) => b.dialogue.length + b.props.length);
        const best = Math.max(...densities);
        const idx = densities.indexOf(best);
        const honored = best >= d.check.detailDensityMin;
        rows.push({
          kind: d.kind,
          title: d.title,
          honored,
          informational: false,
          evidence: honored
            ? `beat ${idx} carries ${best} concrete details (≥ ${d.check.detailDensityMin})`
            : `densest first-half beat carries only ${best} details (< ${d.check.detailDensityMin})`,
        });
        break;
      }
      case 'ECONOMY': {
        const reused = beats.filter((b) => knownLocations.has(b.location)).length;
        const ratio = reused / Math.max(1, beats.length);
        const honored = ratio >= d.check.reuseRatioMin;
        rows.push({
          kind: d.kind,
          title: d.title,
          honored,
          informational: false,
          evidence: `${reused}/${beats.length} beats reuse established locations (${Math.round(ratio * 100)}% ≥ ${Math.round(d.check.reuseRatioMin * 100)}%)`,
        });
        break;
      }
    }
  }

  const checkable = rows.filter((r) => !r.informational).length;
  const honoredCount = rows.filter((r) => r.honored).length;
  const honoredCheckable = rows.filter((r) => !r.informational && r.honored).length;

  return {
    rows,
    honoredCount,
    honoredCheckable,
    checkable,
    total: rows.length,
    allHonored: checkable > 0 && honoredCount === rows.length,
  };
}

function textOf(b: Beat): string {
  return [b.title, ...b.dialogue.map((d) => d.line), b.purpose].join(' ');
}

/** loose natural-language containment: normalize, then substring match */
function mentions(haystack: string, needle: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return norm(haystack).includes(norm(needle));
}

export async function verifyBriefCompliance(episodeId: string): Promise<BriefCompliance | null> {
  const episode = await db.episode.findUnique({ where: { id: episodeId } });
  if (!episode || !episode.briefJson) return null;
  const brief = jparse<(WriterBrief & { directives: (BriefDirective & { check?: BriefCheck })[] }) | null>(
    episode.briefJson,
    null
  );
  if (!brief) return null;

  const stored = jparse<Beat[] | { beats: Beat[] } | null>(episode.beatPlan, []);
  const beats = Array.isArray(stored) ? stored : (stored?.beats ?? []);
  if (beats.length === 0) return null;

  const known = await knownLocationsForArm(episode.showId, episode.arm);
  const outcome = await verifyPlanAgainstBrief(brief, beats, known);

  return {
    episodeId,
    episodeNumber: episode.number,
    arm: episode.arm,
    briefFingerprint: episode.briefFingerprint,
    cohort: brief.cohort ?? null,
    ...outcome,
  };
}

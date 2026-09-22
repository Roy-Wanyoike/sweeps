import { Beat, BeatPlan, CompileReport, TimeOfDay } from '@/lib/contracts';
import { CompileCtx, compilePlan } from './compiler';
import { WriteCtx, fallbackPlan, llmRepair } from './writer';

/**
 * Bounded repair loop: deterministic autofix first (guaranteed convergence),
 * then one LLM-assisted repair if the provider is available. Max 3 loops.
 *
 * Convergence argument: fixes only REMOVE elements (cast members, prop actions,
 * lore assertions) or strictly increase time-of-day ranks / clamp durations.
 * Beats that end up with no cast are dropped (removal never creates new
 * violations), so each iteration strictly reduces the violation surface.
 */

const TOD_BY_RANK: Record<number, TimeOfDay> = { 0: 'DAWN', 1: 'DAY', 2: 'DUSK', 3: 'NIGHT' };
const RANK_BY_TOD: Record<TimeOfDay, number> = { DAWN: 0, DAY: 1, DUSK: 2, NIGHT: 3 };

function autofix(beats: Beat[], report: CompileReport): Beat[] {
  // tracks relocations within this pass so chained C2 fixes anchor correctly
  const relocatedMap = new Map<number, string>();
  const out = beats.map((b) => ({
    ...b,
    props: [...b.props],
    cast: [...b.cast],
    loreAssertions: [...b.loreAssertions],
    wardrobe: { ...b.wardrobe },
  }));

  for (const v of report.violations) {
    const b = out[v.beatIndex];
    if (!b && v.beatIndex !== 0) continue;
    switch (v.rule) {
      case 'C1-CAST': {
        if (b) {
          // remove the unknown/absent character named in the message
          const m = v.message.match(/"([^"]+)" is not in the show bible/);
          if (m) b.cast = b.cast.filter((c) => c !== m[1]);
        }
        break;
      }
      case 'C2-PRESENCE': {
        if (!b) break;
        const mPrevLoc = v.message.match(/teleports from "([^"]+)"/);
        if (v.severity === 'ERROR' && mPrevLoc) {
          // Cast-preserving fix: move the scene back to where the cast just was.
          // If the PREVIOUS beat was relocated earlier in this same pass, anchor
          // to its NEW location instead of the stale one (chains converge).
          const relocated = relocatedMap.get(v.beatIndex - 1);
          b.location = relocated ?? mPrevLoc[1];
          relocatedMap.set(v.beatIndex, b.location);
        } else if (v.severity === 'ERROR') {
          // no location anchor found — drop the teleporting character as a last resort
          const m = v.message.match(/^"([^"]+)" teleports/);
          if (m) b.cast = b.cast.filter((c) => c !== m[1]);
        }
        // WARN (cross-time-of-day travel) is acceptable — does not block rendering
        break;
      }
      case 'C3-TIMELINE': {
        if (b) {
          const m = v.message.match(/\((\d) < (\d)\)/);
          if (m) b.timeOfDay = TOD_BY_RANK[Number(m[2])] ?? 'NIGHT';
        }
        break;
      }
      case 'C4-PROP': {
        if (!b) break;
        const m = v.message.match(/Prop "([^"]+)"/);
        if (!m) break;
        const name = m[1];
        if (v.message.includes('used before it is introduced')) {
          const entry = b.props.find((p) => p.ref === name);
          if (entry) entry.action = 'INTRODUCE';
        } else if (v.message.includes('dropped but never carried')) {
          b.props = b.props.filter((p) => !(p.ref === name && p.action === 'DROP'));
        } else if (v.message.includes('Unknown prop')) {
          b.props = b.props.filter((p) => p.ref !== name);
        }
        break;
      }
      case 'C5-WARDROBE': {
        if (!b) break;
        if (v.message.includes('not in this scene')) {
          const m = v.message.match(/for "([^"]+)"/);
          if (m) delete b.wardrobe[m[1]];
        } else if (v.message.includes('changes costume')) {
          const m = v.message.match(/\(([^ ]+) -> [^)]+\)/);
          if (m) {
            const who = v.message.match(/"([^"]+)" changes/)?.[1];
            if (who) b.wardrobe[who] = m[1];
          }
        }
        break;
      }
      case 'C6-LORE': {
        if (b) {
          const m = v.message.match(/"([^=]+)=/);
          if (m) b.loreAssertions = b.loreAssertions.filter((la) => la.key !== m[1]);
        }
        break;
      }
      case 'C8-DURATION': {
        if (!b) break;
        if (v.message.includes('runtime')) {
          const total = out.reduce((a, x) => a + Math.max(4, x.durationSec), 0);
          const scale = Math.max(0.3, Math.min(2.5, 200 / total));
          for (const x of out) x.durationSec = Math.min(20, Math.max(4, Math.round(x.durationSec * scale)));
        } else {
          const m = v.message.match(/duration (\d+)s/);
          if (m) b.durationSec = Math.min(20, Math.max(4, Number(m[1])));
        }
        break;
      }
      default:
        break;
    }
  }

  // drop cast-less beats (never creates new violations), reindex, keep >= 4 beats
  const kept = out.filter((b) => b.cast.length > 0);
  const final = kept.length >= 4 ? kept : out; // if we'd fall under the schema floor, keep originals
  return final.map((b, i) => ({ ...b, index: i }));
}

export interface RepairResult {
  plan: BeatPlan;
  report: CompileReport;
  loops: number;
  method: 'PASS_AS_IS' | 'AUTOFIX' | 'LLM' | 'FAILED';
}

export async function repairLoop(
  ctx: WriteCtx,
  compileCtx: CompileCtx,
  initial: BeatPlan,
  initialReport: CompileReport
): Promise<RepairResult> {
  if (initialReport.status !== 'FAIL') {
    return { plan: initial, report: initialReport, loops: 0, method: 'PASS_AS_IS' };
  }
  let beats = initial.beats;
  let report = initialReport;
  let loops = 0;
  let method: RepairResult['method'] = 'FAILED';

  // Deterministic autofix passes (zero AI cost): each pass resolves every
  // violation reported so far; location-block chains converge hop-by-hop,
  // so we iterate with a no-progress guard instead of a tiny fixed count.
  let lastSignature = '';
  while (report.status === 'FAIL' && loops < 12) {
    loops += 1;
    beats = autofix(beats, report);
    // keep runtime in window
    const total = beats.reduce((a, x) => a + x.durationSec, 0);
    if (total > 240) {
      const scale = 200 / total;
      beats = beats.map((b) => ({ ...b, durationSec: Math.min(20, Math.max(4, Math.round(b.durationSec * scale))) }));
    }
    const normalized: BeatPlan = {
      beats: beats.map((b, i) => ({ ...b, index: i, timeOfDay: RANK_BY_TOD[RANK_BY_TOD[b.timeOfDay]] ? b.timeOfDay : 'DAY' })),
      summary: initial.summary,
    };
    beats = normalized.beats;
    report = compilePlan(beats, compileCtx);
    method = 'AUTOFIX';
    if (report.status !== 'FAIL') {
      return { plan: { beats, summary: initial.summary }, report, loops, method };
    }
    const signature = report.violations.map((v) => `${v.rule}@${v.beatIndex}:${v.severity}`).join(',');
    if (signature === lastSignature) {
      // a full pass produced zero movement — deterministic repair is exhausted
      break;
    }
    lastSignature = signature;
  }

  if (report.status === 'FAIL' && loops < 13) {
    loops += 1;
    const llm = await llmRepair(ctx, { beats, summary: initial.summary }, report.violations);
    method = 'LLM';
    if (llm) {
      report = compilePlan(llm.beats, compileCtx);
      // keep plan and report consistent even when the repair still fails
      beats = llm.beats;
      if (report.status !== 'FAIL') {
        return { plan: llm, report, loops, method };
      }
    }
  }

  return { plan: { beats, summary: initial.summary }, report, loops, method: report.status === 'FAIL' ? 'FAILED' : method };
}

export { fallbackPlan, autofix };

import {
  Beat,
  CompileReport,
  TimeOfDay,
  Violation,
  jparse,
  normKey,
} from '@/lib/contracts';
import { IMAGE_COST_USD, VIDEO_COST_PER_SEC_USD } from '@/lib/ai/prices';

/**
 * The Continuity Compiler — pure TypeScript, zero AI calls, fully deterministic.
 * Compiles a beat plan against the show bible and returns hard violations with
 * machine-actionable fix suggestions BEFORE a single generation token is spent.
 */

export interface CharacterInfo {
  attrs: Record<string, string>;
  refImage: boolean;
}

export interface CompileCtx {
  characters: Map<string, CharacterInfo>;
  locations: Set<string>;
  props: Set<string>;
  priorLore: Record<string, string>;
  renderBudgetUsd: number;
  renderMode: 'STILLS' | 'VIDEO';
}

const TOD_RANK: Record<TimeOfDay, number> = { DAWN: 0, DAY: 1, DUSK: 2, NIGHT: 3 };

export function estimateRenderCost(beats: Beat[], mode: 'STILLS' | 'VIDEO'): number {
  const totalSec = beats.reduce((a, b) => a + Math.max(4, b.durationSec), 0);
  const stills = beats.length * IMAGE_COST_USD;
  return mode === 'VIDEO' ? stills + totalSec * VIDEO_COST_PER_SEC_USD : stills;
}

export function compilePlan(beats: Beat[], ctx: CompileCtx): CompileReport {
  const violations: Violation[] = [];
  const add = (v: Violation) => violations.push(v);
  const t0: number[] = [];
  let acc = 0;
  for (const b of beats) {
    t0.push(acc);
    acc += Math.max(4, b.durationSec);
  }

  /* ------------------------------ C1-CAST ------------------------------ */
  for (const b of beats) {
    for (const name of b.cast) {
      const info = ctx.characters.get(normKey(name));
      if (!info) {
        add({
          rule: 'C1-CAST',
          beatIndex: b.index,
          message: `Unknown character "${name}" is not in the show bible.`,
          fixSuggestion: `Replace "${name}" with one of: ${[...ctx.characters.keys()].slice(0, 4).join(', ')}.`,
          severity: 'ERROR',
        });
      } else if (!info.refImage) {
        add({
          rule: 'C1-CAST',
          beatIndex: b.index,
          message: `Character "${name}" has no reference still.`,
          fixSuggestion: `Generate a reference still for "${name}" before rendering.`,
          severity: 'WARN',
        });
      }
    }
    if (b.cast.length === 0) {
      add({
        rule: 'C1-CAST',
        beatIndex: b.index,
        message: 'Beat has no cast; an empty scene cannot be staged.',
        fixSuggestion: 'Assign at least one character to this beat.',
        severity: 'ERROR',
      });
    }
  }

  /* ---------------------------- C2-PRESENCE ---------------------------- */
  for (let i = 1; i < beats.length; i++) {
    const prev = beats[i - 1];
    const cur = beats[i];
    for (const name of cur.cast) {
      if (!prev.cast.includes(name)) continue;
      if (normKey(prev.location) !== normKey(cur.location)) {
        const sameTod = TOD_RANK[prev.timeOfDay] === TOD_RANK[cur.timeOfDay];
        add({
          rule: 'C2-PRESENCE',
          beatIndex: cur.index,
          message: `"${name}" teleports from "${prev.location}" (${prev.timeOfDay}) to "${cur.location}" (${cur.timeOfDay}) with no travel gap.`,
          fixSuggestion: sameTod
            ? `Set beat ${cur.index} location to "${prev.location}", or insert a transition beat.`
            : `Insert a transition beat, or keep "${name}" at "${prev.location}".`,
          severity: sameTod ? 'ERROR' : 'WARN',
        });
      }
    }
  }

  /* ---------------------------- C3-TIMELINE ---------------------------- */
  const lastRank = new Map<string, { beat: number; rank: number }>();
  for (const b of beats) {
    const key = normKey(b.location);
    const rank = TOD_RANK[b.timeOfDay];
    const seen = lastRank.get(key);
    if (seen && rank < seen.rank) {
      add({
        rule: 'C3-TIMELINE',
        beatIndex: b.index,
        message: `Time runs backwards at "${b.location}": beat ${seen.beat} was later in the day (${rank} < ${seen.rank}).`,
        fixSuggestion: `Set beat ${b.index} timeOfDay to ${Object.keys(TOD_RANK).find((k) => TOD_RANK[k as TimeOfDay] === seen.rank) ?? 'DAY'} or later.`,
        severity: 'ERROR',
      });
    }
    lastRank.set(key, { beat: b.index, rank });
  }

  /* ------------------------------ C4-PROP ------------------------------ */
  const inventory = new Map<string, 'available' | 'dropped'>();
  const introduced = new Set<string>();
  for (const b of beats) {
    for (const p of b.props) {
      const key = normKey(p.ref);
      if (ctx.props.size > 0 && !ctx.props.has(key)) {
        add({
          rule: 'C4-PROP',
          beatIndex: b.index,
          message: `Unknown prop "${p.ref}" is not registered in the world.`,
          fixSuggestion: `Use a registered prop, or add "${p.ref}" to the world entities.`,
          severity: 'ERROR',
        });
        continue;
      }
      if (p.action === 'INTRODUCE') {
        if (inventory.get(key) === 'available') {
          add({
            rule: 'C4-PROP',
            beatIndex: b.index,
            message: `Prop "${p.ref}" introduced twice.`,
            fixSuggestion: `Change this action to USE.`,
            severity: 'WARN',
          });
        }
        inventory.set(key, 'available');
        introduced.add(key);
      } else if (p.action === 'USE') {
        if (inventory.get(key) !== 'available') {
          add({
            rule: 'C4-PROP',
            beatIndex: b.index,
            message: `Prop "${p.ref}" is used before it is introduced.`,
            fixSuggestion: `INTRODUCE "${p.ref}" in an earlier beat, or remove this USE.`,
            severity: 'ERROR',
          });
        }
      } else if (p.action === 'DROP') {
        if (inventory.get(key) !== 'available') {
          add({
            rule: 'C4-PROP',
            beatIndex: b.index,
            message: `Prop "${p.ref}" is dropped but never carried.`,
            fixSuggestion: `INTRODUCE "${p.ref}" before dropping it.`,
            severity: 'ERROR',
          });
        } else {
          inventory.set(key, 'dropped');
        }
      }
    }
  }

  /* --------------------------- C5-WARDROBE ----------------------------- */
  let prevBeat: Beat | null = null;
  for (const b of beats) {
    for (const who of Object.keys(b.wardrobe)) {
      if (!b.cast.includes(who)) {
        add({
          rule: 'C5-WARDROBE',
          beatIndex: b.index,
          message: `Wardrobe specified for "${who}" who is not in this scene.`,
          fixSuggestion: `Add "${who}" to cast, or remove the wardrobe entry.`,
          severity: 'ERROR',
        });
      }
    }
    if (
      prevBeat &&
      normKey(prevBeat.location) === normKey(b.location) &&
      prevBeat.timeOfDay === b.timeOfDay
    ) {
      for (const who of Object.keys(b.wardrobe)) {
        const prevOutfit = prevBeat.wardrobe[who];
        if (prevOutfit && prevOutfit !== b.wardrobe[who]) {
          add({
            rule: 'C5-WARDROBE',
            beatIndex: b.index,
            message: `"${who}" changes costume mid-scene (${prevOutfit} -> ${b.wardrobe[who]}).`,
            fixSuggestion: `Keep outfit "${prevOutfit}" for this scene.`,
            severity: 'WARN',
          });
        }
      }
    }
    prevBeat = b;
  }

  /* ------------------------------ C6-LORE ------------------------------ */
  const inPlan = new Map<string, string>();
  for (const b of beats) {
    for (const la of b.loreAssertions) {
      const key = normKey(la.key);
      const val = normKey(la.value);
      const committed = ctx.priorLore[key];
      if (committed !== undefined && normKey(committed) !== val) {
        add({
          rule: 'C6-LORE',
          beatIndex: b.index,
          message: `"${la.key}=${la.value}" contradicts committed lore ("${committed}").`,
          fixSuggestion: `Align with the established value "${committed}", or pick a new key.`,
          severity: 'ERROR',
        });
      }
      const inPlanVal = inPlan.get(key);
      if (inPlanVal !== undefined && inPlanVal !== val) {
        add({
          rule: 'C6-LORE',
          beatIndex: b.index,
          message: `Plan self-contradiction: "${la.key}" is both "${inPlanVal}" and "${la.value}".`,
          fixSuggestion: `Pick one value for "${la.key}".`,
          severity: 'ERROR',
        });
      }
      inPlan.set(key, val);
    }
  }

  /* ----------------------------- C7-BUDGET ----------------------------- */
  const estimated = estimateRenderCost(beats, ctx.renderMode);
  if (estimated > ctx.renderBudgetUsd) {
    const stillsCost = estimateRenderCost(beats, 'STILLS');
    if (stillsCost <= ctx.renderBudgetUsd && ctx.renderMode === 'VIDEO') {
      add({
        rule: 'C7-BUDGET',
        beatIndex: 0,
        message: `Video render plan costs $${estimated.toFixed(2)} > budget $${ctx.renderBudgetUsd.toFixed(2)}.`,
        fixSuggestion: `Downgrade to STILLS mode (estimated $${stillsCost.toFixed(2)}).`,
        severity: 'WARN',
      });
    } else {
      add({
        rule: 'C7-BUDGET',
        beatIndex: 0,
        message: `Render plan costs $${estimated.toFixed(2)} > budget $${ctx.renderBudgetUsd.toFixed(2)}.`,
        fixSuggestion: `Trim ${Math.ceil((estimated - ctx.renderBudgetUsd) / IMAGE_COST_USD)} beats or shorten durations.`,
        severity: 'ERROR',
      });
    }
  }

  /* ---------------------------- C8-DURATION ---------------------------- */
  for (const b of beats) {
    if (b.durationSec < 4 || b.durationSec > 20) {
      add({
        rule: 'C8-DURATION',
        beatIndex: b.index,
        message: `Beat duration ${b.durationSec}s outside 4–20s.`,
        fixSuggestion: `Set durationSec to ${Math.min(20, Math.max(4, Math.round(b.durationSec)))}.`,
        severity: 'ERROR',
      });
    }
  }
  const total = acc;
  if (total < 90 || total > 240) {
    add({
      rule: 'C8-DURATION',
      beatIndex: 0,
      message: `Episode runtime ${Math.round(total)}s outside 90–240s.`,
      fixSuggestion: `Add or trim beats to land between 90s and 240s.`,
      severity: 'WARN',
    });
  }

  const hasError = violations.some((v) => v.severity === 'ERROR');
  const status: CompileReport['status'] = hasError ? 'FAIL' : violations.length > 0 ? 'WARN' : 'PASS';
  return { status, estimatedCostUsd: estimated, violations };
}

/** Build a compile context from the fixture itself (self-contained gate demo). */
export function fixtureCtx(beats: Beat[]): CompileCtx {
  const characters = new Map<string, CharacterInfo>();
  const locations = new Set<string>();
  const props = new Set<string>();
  for (const b of beats) {
    for (const c of b.cast) characters.set(normKey(c), { attrs: {}, refImage: true });
    locations.add(normKey(b.location));
    for (const p of b.props) props.add(normKey(p.ref));
    for (const [k, v] of Object.entries(b.wardrobe)) {
      if (!characters.has(normKey(k))) characters.set(normKey(k), { attrs: {}, refImage: true });
    }
  }
  return {
    characters,
    locations,
    props,
    priorLore: {},
    renderBudgetUsd: 1000,
    renderMode: 'STILLS',
  };
}

export { jparse };

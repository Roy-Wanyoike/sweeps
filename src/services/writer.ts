import { db } from '@/lib/db';
import { getAIProvider, meteredChat } from '@/lib/ai/provider';
import { Beat, BeatPlan, BeatPlanSchema, BeatSchema, BeatType, jparse } from '@/lib/contracts';
import { hashSeed } from '@/lib/sim/rng';
import type { WriterBrief } from './arc';

export interface WriteCtx {
  show: { id: string; title: string; premise: string; genre: string; visualStyle: string; seed: number; episodeCount: number; mode: string };
  characters: { name: string; role: string; appearance: string; personality: string }[];
  locations: { name: string; desc: string }[];
  props: { name: string; desc: string }[];
  episodeNumber: number;
  priorSummaries: { number: number; summary: string }[];
  analyticsBlock?: string;
  directives?: { slotIndex: number; beat: Beat; rationale: string }[];
  /** Writer's brief computed from measured panel data — injected into the prompt
   *  and applied deterministically to fallback plans (arm B, ep 2+). */
  brief?: WriterBrief | null;
}

const SYSTEM = `You are an autonomous AI showrunner writing one episode of a serialized drama as a structured "beat plan".
Respond with ONLY JSON: {"beats":[...], "summary":"2 sentences"}.
Each beat: {"index":int,"title":"...","type":"HOOK|SETUP|ESCALATION|REVEAL|TWIST|CONFLICT|BREATH|CLIFFHANGER","location":"exact location name","timeOfDay":"DAWN|DAY|DUSK|NIGHT","durationSec":int(8-16),"cast":["exact character names"],"props":[{"ref":"exact prop name","action":"INTRODUCE|USE|DROP"}],"wardrobe":{"charName":"outfit-tag"},"loreAssertions":[{"key","value"}],"visualPrompt":"one rich sentence for the frame","dialogue":[{"char","line","emotion"}],"purpose":"why this beat exists","qualitySelfScore":0..1}
HARD RULES: use ONLY provided characters/locations/props with exact names; INTRODUCE a prop before USE; a character must not change location between consecutive beats; timeOfDay must never run backwards at the same location; 9-12 beats; the CLIFFHANGER must end the episode.`;

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no-json');
  return JSON.parse(text.slice(start, end + 1));
}

export function buildUserPrompt(ctx: WriteCtx): string {
  const lines: string[] = [];
  lines.push(`SERIES: ${ctx.show.title}`);
  lines.push(`PREMISE: ${ctx.show.premise}`);
  lines.push(`GENRE: ${ctx.show.genre} | STYLE: ${ctx.show.visualStyle} | EPISODE: ${ctx.episodeNumber} of ${ctx.show.episodeCount}`);
  lines.push(`CHARACTERS:\n${ctx.characters.map((c) => `- ${c.name} (${c.role}): ${c.personality}`).join('\n')}`);
  lines.push(`LOCATIONS:\n${ctx.locations.map((l) => `- ${l.name}: ${l.desc}`).join('\n')}`);
  lines.push(`PROPS:\n${ctx.props.map((p) => `- ${p.name}: ${p.desc}`).join('\n')}`);
  if (ctx.priorSummaries.length > 0) {
    lines.push(`STORY SO FAR:\n${ctx.priorSummaries.map((s) => `Ep${s.number}: ${s.summary}`).join('\n')}`);
  }
  if (ctx.analyticsBlock) {
    lines.push(`MEASURED AUDIENCE RESPONSE (optimize retention against this):\n${ctx.analyticsBlock}`);
  }
  if (ctx.brief && ctx.brief.directives.length > 0) {
    lines.push(briefToWriterText(ctx.brief));
  }
  if (ctx.directives && ctx.directives.length > 0) {
    lines.push(
      `A/B EXperiments DECIDED BY THOMPSON SAMPLING — use these EXACT beats at the given slots:\n${ctx.directives
        .map((d) => `Slot ${d.slotIndex}: ${JSON.stringify(d.beat)} (rationale: ${d.rationale})`)
        .join('\n')}`
    );
  }
  lines.push('Write episode ' + ctx.episodeNumber + ' now. JSON only.');
  return lines.join('\n\n');
}

/** Format the brief as an imperative writer instruction block (each directive
 *  carries its machine-checkable contract so the writer knows it is graded). */
export function briefToWriterText(brief: WriterBrief): string {
  const head = `WRITER'S BRIEF — MEASURED-DATA DIRECTIVES FOR EPISODE ${brief.nextEpisodeNumber}` +
    (brief.cohort ? ` (written through the ${brief.cohort} cohort lens)` : ' (whole panel)') +
    `. A deterministic compliance checker will verify each contract below — follow them exactly.`;
  const items = brief.directives.map((d, i) => {
    let contract = '';
    if (d.check) {
      switch (d.check.type) {
        case 'CALLBACK':
          contract = `CONTRACT: one of the first ${d.check.withinFirstNBeats} beats must reference "${d.check.threadTitle}" verbatim in its title or dialogue.`;
          break;
        case 'HOOK':
          contract = `CONTRACT: beat 0 must re-state the cliffhanger "${d.check.cliffhangerTitle}" in its dialogue.`;
          break;
        case 'PROTECT_BEAT':
          contract = `CONTRACT: every beat in the first half must run ≤ ${d.check.maxFirstHalfSec}s.`;
          break;
        case 'COHORT':
          contract = `CONTRACT: some beat in the first half must carry ≥ ${d.check.detailDensityMin} concrete details (dialogue lines + prop actions).`;
          break;
        case 'ECONOMY':
          contract = `CONTRACT: ≥ ${Math.round(d.check.reuseRatioMin * 100)}% of beats must reuse locations already established in this arm.`;
          break;
      }
    }
    return `${i + 1}. [${d.kind}] ${d.title} — ${d.body}${contract ? `\n   ${contract}` : ''}`;
  });
  return `${head}\n${items.join('\n')}`;
}

/** Deterministic fallback plan — always compiles clean against its own bible. */
export function fallbackPlan(ctx: WriteCtx): BeatPlan {
  const c1 = ctx.characters[0]?.name ?? 'Mara Voss';
  const c2 = ctx.characters[1]?.name ?? c1;
  const c3 = ctx.characters[2]?.name ?? c1;
  const L1 = ctx.locations[0]?.name ?? 'Studio';
  const L2 = ctx.locations[1]?.name ?? L1;
  const L3 = ctx.locations[2]?.name ?? L1;
  const p1 = ctx.props[0]?.name ?? 'the file';
  const p2 = ctx.props[1]?.name ?? 'the phone';
  const n = ctx.episodeNumber;
  const mk = (
    index: number,
    type: BeatType,
    title: string,
    location: string,
    timeOfDay: Beat['timeOfDay'],
    cast: string[],
    props: Beat['props'],
    dialogue: Beat['dialogue'],
    purpose: string,
    quality = 0.62
  ): Beat => ({
    index,
    title,
    type,
    location,
    timeOfDay,
    durationSec: 12 + (index % 3) * 2,
    cast,
    props,
    wardrobe: {},
    loreAssertions: [],
    visualPrompt: `${title} — ${cast.join(' and ')} at ${location}, ${ctx.show.visualStyle}, cinematic`,
    dialogue,
    purpose,
    qualitySelfScore: quality,
  });

  const beats: Beat[] = [
    mk(0, 'HOOK', `Cold open: the signal returns`, L1, 'DAWN', [c1, c2], [{ ref: p1, action: 'INTRODUCE' }], [
      { char: c1, line: 'It started again at 3 a.m. Same frequency.', emotion: 'tense' },
      { char: c2, line: 'Then we move before they do.', emotion: 'resolved' },
    ], 'Cold-open hook reusing the season engine', 0.7),
    mk(1, 'SETUP', `${c3} receives an offer`, L2, 'DAY', [c3], [], [
      { char: c3, line: 'Everyone has a price. I just never liked theirs.', emotion: 'wry' },
    ], 'Establish the antagonist lever', 0.6),
    mk(2, 'ESCALATION', 'The ledger opens', L1, 'DAY', [c1, c2], [{ ref: p1, action: 'USE' }], [
      { char: c1, line: 'Page nine. Every name we feared, priced.', emotion: 'grim' },
    ], 'Escalate stakes through evidence', 0.66),
    mk(3, 'CONFLICT', 'A deal goes sideways', L3, 'DUSK', [c3], [{ ref: p2, action: 'INTRODUCE' }], [
      { char: c3, line: 'You want loyalty? Hire a dog.', emotion: 'hostile' },
    ], 'Antagonist pressure collides with protagonist plan', 0.64),
    mk(4, 'REVEAL', `The name on page nine`, L1, 'DUSK', [c1], [{ ref: p1, action: 'USE' }], [
      { char: c1, line: 'It was never the network. It was family.', emotion: 'shaken' },
    ], 'Midpoint reveal reframes the hunt', 0.72),
    mk(5, 'BREATH', 'Quiet before the storm', L2, 'DUSK', [c3], [], [
      { char: c3, line: 'One clean exit. That is all I wanted.', emotion: 'weary' },
    ], 'Character breather to reset tension', 0.55),
    mk(6, 'TWIST', 'The fixer flips', L3, 'NIGHT', [c1, c2], [{ ref: p2, action: 'USE' }], [
      { char: c2, line: 'I did not flip. I picked the winning side.', emotion: 'cold' },
    ], 'Allegiance twist raises stakes', 0.74),
    mk(7, 'ESCALATION', 'Sweep of the archive', L3, 'NIGHT', [c1, c2, c3], [{ ref: p2, action: 'USE' }], [
      { char: c1, line: 'Whatever happens, the ledger goes public.', emotion: 'defiant' },
    ], 'All parties converge', 0.68),
    mk(8, 'CONFLICT', 'Terms at gunpoint', L2, 'NIGHT', [c3], [], [
      { char: c3, line: 'Print it, and I bury you with it.', emotion: 'threatening' },
    ], 'Direct confrontation', 0.66),
    mk(9, 'CLIFFHANGER', `The antenna turns by itself`, L3, 'NIGHT', [c1, c2], [{ ref: p2, action: 'USE' }], [
      { char: c1, line: 'That transmission... it is counting down.', emotion: 'dread' },
    ], 'Cliffhanger: the signal counts down', 0.78),
  ];
  const plan: BeatPlan = {
    beats,
    summary: `Episode ${n}: ${c1} closes on the ledger while ${c3} plays both sides; the signal returns with a countdown.`,
  };
  return applyDirectives(plan, ctx.directives);
}

export function applyDirectives(plan: BeatPlan, directives?: WriteCtx['directives']): BeatPlan {
  if (!directives || directives.length === 0) return plan;
  const beats = [...plan.beats];
  for (const d of directives) {
    if (d.slotIndex >= 0 && d.slotIndex < beats.length) {
      beats[d.slotIndex] = { ...d.beat, index: d.slotIndex };
    }
  }
  return { ...plan, beats };
}

/**
 * Deterministically honor the writer's brief on a beat plan.
 *
 * The LLM path is instructed (and graded by the compliance checker); the
 * deterministic fallback path is rewritten HERE so the loop closes even with
 * zero AI: callbacks get their dialogue line, the hook gets its restatement,
 * first-half beats get the length cap, and the detail-density contract is met.
 */
export function applyBriefToPlan(plan: BeatPlan, brief?: WriterBrief | null): BeatPlan {
  if (!brief || brief.directives.length === 0) return plan;
  const beats = plan.beats.map((b) => ({ ...b, dialogue: [...b.dialogue], props: [...b.props] }));
  if (beats.length === 0) return plan;
  const half = Math.max(1, Math.ceil(beats.length / 2));

  for (const d of brief.directives) {
    if (!d.check) continue;
    switch (d.check.type) {
      case 'CALLBACK': {
        // reference the fading thread verbatim inside the first N beats
        const target = beats[Math.min(d.check.withinFirstNBeats, beats.length) - 1];
        const speaker = target.cast[0] ?? 'narrator';
        target.dialogue.push({
          char: speaker,
          line: `"${d.check.threadTitle}" — that thread never closed. We deal with it now.`,
          emotion: 'tense',
        });
        break;
      }
      case 'HOOK': {
        // re-state the cliffhanger stakes in beat 0
        const target = beats[0];
        const speaker = target.cast[0] ?? 'narrator';
        target.dialogue.unshift({
          char: speaker,
          line: `After "${d.check.cliffhangerTitle}", nothing is normal anymore.`,
          emotion: 'dread',
        });
        break;
      }
      case 'PROTECT_BEAT': {
        // hard length cap on first-half beats (churn beats run long)
        for (let i = 0; i < half; i++) {
          beats[i].durationSec = Math.min(beats[i].durationSec, d.check.maxFirstHalfSec);
        }
        break;
      }
      case 'COHORT': {
        // guarantee a detail-dense first-half beat (dialogue + prop actions ≥ min)
        let target = beats[0];
        for (let i = 0; i < half; i++) {
          if (beats[i].dialogue.length + beats[i].props.length > target.dialogue.length + target.props.length) target = beats[i];
        }
        let density = target.dialogue.length + target.props.length;
        const speaker = target.cast[0] ?? 'narrator';
        const second = target.cast[1] ?? speaker;
        while (density < d.check.detailDensityMin) {
          target.dialogue.push(
            density % 2 === 0
              ? { char: speaker, line: 'Every detail matters here — check the timestamps, the labels, all of it.', emotion: 'focused' }
              : { char: second, line: 'Nothing slips past us this time. Look closer.', emotion: 'resolved' }
          );
          density++;
        }
        break;
      }
      case 'ECONOMY':
        // locations come from the show bible in the fallback path — already established
        break;
    }
  }
  return { ...plan, beats };
}

export function normalizePlan(plan: BeatPlan, ctx: WriteCtx): BeatPlan {
  const locNames = ctx.locations.map((l) => l.name);
  const beats = plan.beats.map((b, i) => {
    let location = b.location;
    const match = locNames.find((l) => l.toLowerCase() === location.toLowerCase());
    if (match) location = match;
    else if (locNames.length > 0 && !ctx.locations.some((l) => l.name === location)) location = locNames[i % locNames.length];
    const cast = b.cast.length > 0 ? b.cast : ctx.characters.slice(0, 1).map((c) => c.name);
    const dialogue = b.dialogue.map((d) => ({ ...d, char: d.char }));
    return {
      ...b,
      index: i,
      location,
      cast,
      dialogue,
      durationSec: Math.min(20, Math.max(4, Math.round(b.durationSec))),
      qualitySelfScore: Math.min(1, Math.max(0, b.qualitySelfScore ?? 0.6)),
    };
  });
  return { beats, summary: plan.summary || `Episode ${ctx.episodeNumber}.` };
}

/** Generate a beat plan for one episode. Falls back deterministically when AI is unavailable. */
export async function generatePlan(ctx: WriteCtx): Promise<BeatPlan> {
  const provider = getAIProvider();
  const user = buildUserPrompt(ctx);
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await meteredChat(
      provider,
      { showId: ctx.show.id, stage: 'WRITER', tier: 'BIG', maxTokens: 5000 },
      SYSTEM + (attempt > 0 ? ' Your previous output was invalid JSON. Return ONLY valid JSON.' : ''),
      user
    );
    if (!text) break;
    try {
      const parsed = BeatPlanSchema.safeParse(extractJson(text));
      if (parsed.success) {
        return applyBriefToPlan(applyDirectives(normalizePlan(parsed.data, ctx), ctx.directives), ctx.brief);
      }
    } catch {
      /* retry */
    }
  }
  return applyBriefToPlan(applyDirectives(fallbackPlan(ctx), ctx.directives), ctx.brief);
}

/** Repairer assist: ask the writer to fix a failed plan (deterministic autofix runs first). */
export async function llmRepair(
  ctx: WriteCtx,
  plan: BeatPlan,
  violations: { rule: string; beatIndex: number; message: string; fixSuggestion: string }[]
): Promise<BeatPlan | null> {
  const provider = getAIProvider();
  const user = `Fix this beat plan. Violations:\n${violations
    .map((v) => `- [${v.rule}] beat ${v.beatIndex}: ${v.message} FIX: ${v.fixSuggestion}`)
    .join('\n')}\n\nPLAN:\n${JSON.stringify(plan)}\n\nReturn the corrected plan as JSON only.`
  const text = await meteredChat(provider, { showId: ctx.show.id, stage: 'WRITER', tier: 'FAST', maxTokens: 5000 }, SYSTEM, user);
  if (!text) return null;
  try {
    const parsed = BeatPlanSchema.safeParse(extractJson(text));
    if (parsed.success) return applyBriefToPlan(applyDirectives(normalizePlan(parsed.data, ctx), ctx.directives), ctx.brief);
  } catch {
    return null;
  }
  return null;
}

/** Two A/B variants for a weak beat slot (optimizer). */
export async function proposeVariants(
  ctx: WriteCtx,
  beat: Beat,
  cliff: { delta: number; quote?: string }
): Promise<Beat[] | null> {
  const provider = getAIProvider();
  const system = `You are an AI showrunner optimizing RETENTION. Two variant beats will be A/B tested on a simulated audience. Respond ONLY JSON: {"variants":[beatA, beatB]} where each beat matches the beat schema (same location/cast, may change title/type/dialogue/visualPrompt/purpose). Make the two variants meaningfully different strategies.`;
  const user = `Show premise: ${ctx.show.premise}\nWeak beat (retention dropped ${(cliff.delta * 100).toFixed(1)} pts here):\n${JSON.stringify(beat)}\nViewer quote at the cliff: ${cliff.quote ?? 'n/a'}\nReturn 2 variants as JSON.`;
  const text = await meteredChat(provider, { showId: ctx.show.id, stage: 'OPTIMIZER', tier: 'BIG', maxTokens: 3000 }, system, user);
  if (!text) return null;
  try {
    const raw = extractJson(text) as { variants?: unknown[] };
    if (!raw.variants || !Array.isArray(raw.variants)) return null;
    const beats: Beat[] = [];
    for (const v of raw.variants.slice(0, 2)) {
      const beatParsed = BeatSchema.safeParse(v);
      if (beatParsed.success) beats.push(beatParsed.data);
    }
    return beats.length === 2 ? beats : null;
  } catch {
    return null;
  }
}

/** Deterministic variant pair when AI is unavailable. */
export function fallbackVariants(beat: Beat, seed: number): Beat[] {
  const a: Beat = {
    ...beat,
    title: `${beat.title} — cold cut`,
    purpose: `${beat.purpose} (variant A: leaner, faster tension)`,
    visualPrompt: `${beat.visualPrompt}, tighter framing, harder shadows`,
    durationSec: Math.max(4, beat.durationSec - 2),
    qualitySelfScore: Math.min(1, beat.qualitySelfScore + 0.03),
  };
  const b: Beat = {
    ...beat,
    title: `${beat.title} — pressure cut`,
    type: beat.type === 'BREATH' ? 'CONFLICT' : beat.type,
    purpose: `${beat.purpose} (variant B: added confrontation)`,
    visualPrompt: `${beat.visualPrompt}, faces in conflict, close-ups`,
    dialogue:
      beat.dialogue.length > 0
        ? [...beat.dialogue, { char: beat.cast[0] ?? 'narrator', line: 'You knew this would end here.', emotion: 'cold' }]
        : [{ char: beat.cast[0] ?? 'narrator', line: 'You knew this would end here.', emotion: 'cold' }],
    durationSec: Math.min(20, beat.durationSec + 2),
    qualitySelfScore: Math.min(1, beat.qualitySelfScore + 0.05),
  };
  void seed;
  return [a, b];
}

export { jparse, hashSeed };

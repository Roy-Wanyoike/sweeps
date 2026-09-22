import { PrismaClient } from '@prisma/client';
import { compilePlan, CompileCtx } from '../src/services/compiler';
import { autofix } from '../src/services/repairer';
import { jparse, normKey, Beat, CompileReport, TimeOfDay } from '../src/lib/contracts';

const db = new PrismaClient();
const RANK: Record<TimeOfDay, number> = { DAWN: 0, DAY: 1, DUSK: 2, NIGHT: 3 };
async function main() {
  const ep = await db.episode.findUnique({ where: { id: 'cmucxmsvy0b22n5c75z2ylnwi' }, include: { show: true } });
  if (!ep) return;
  const [characters, entities] = await Promise.all([
    db.character.findMany({ where: { showId: ep.showId } }),
    db.worldEntity.findMany({ where: { showId: ep.showId } }),
  ]);
  const charactersMap = new Map<string, { attrs: Record<string, string>; refImage: boolean }>();
  for (const c of characters) charactersMap.set(normKey(c.name), { attrs: jparse(c.attrs, {}), refImage: Boolean(c.refImage) });
  const locations = new Set<string>(); const props = new Set<string>();
  for (const e of entities) { if (e.kind === 'LOCATION') locations.add(normKey(e.name)); else props.add(normKey(e.name)); }
  const priorLore: Record<string, string> = jparse(ep.show.lore ?? null, {});
  const ctx: CompileCtx = { characters: charactersMap, locations, props, priorLore, renderBudgetUsd: ep.show.budgetUsd * 0.45, renderMode: 'STILLS' };
  // NOTE: stored plan = post-repair state; to replay the ORIGINAL we clear compileReport effects —
  // the stored plan IS the last attempt, so instead simulate a fresh compile on it and step passes:
  let plan = jparse<{ beats: Beat[]; summary: string } | null>(ep.beatPlan, null);
  if (!plan) return;
  let report: CompileReport = compilePlan(plan.beats, ctx);
  console.log('PASS0:', report.status, report.violations.map(v => `${v.rule}@${v.beatIndex}:${v.severity}`).join(' '));
  for (let pass = 1; pass <= 3; pass++) {
    let beats = autofix(plan.beats, report, pass);
    const total = beats.reduce((a, x) => a + x.durationSec, 0);
    if (total > 240) { const s = 200 / total; beats = beats.map(b => ({ ...b, durationSec: Math.min(20, Math.max(4, Math.round(b.durationSec * s))) })); }
    beats = beats.map((b, i) => ({ ...b, index: i, timeOfDay: RANK[RANK[b.timeOfDay]] !== undefined ? b.timeOfDay : 'DAY' }));
    plan = { beats, summary: plan.summary };
    report = compilePlan(beats, ctx);
    console.log(`PASS${pass}:`, report.status, report.violations.map(v => `${v.rule}@${v.beatIndex}:${v.severity} ${v.message.slice(0, 70)}`).join('\n       '));
    for (const b of beats) console.log('   ', b.index, b.type, '|', b.location.slice(0, 20), '|', b.timeOfDay, '|', b.cast.join(',').slice(0, 50), '| wardrobe:', JSON.stringify(b.wardrobe).slice(0, 80));
    if (report.status !== 'FAIL') break;
  }
  await db.$disconnect();
}
main();

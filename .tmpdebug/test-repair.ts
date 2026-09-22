import { PrismaClient } from '@prisma/client';
import { compilePlan, CompileCtx } from '../src/services/compiler';
import { repairLoop } from '../src/services/repairer';
import { jparse, normKey, Beat, CompileReport } from '../src/lib/contracts';

const db = new PrismaClient();
async function main() {
  const ep = await db.episode.findUnique({ where: { id: 'cmucxmsvy0b22n5c75z2ylnwi' }, include: { show: true } });
  if (!ep) return;
  const plan = jparse<{ beats: Beat[]; summary: string } | null>(ep.beatPlan, null);
  if (!plan) return;
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
  let report: CompileReport = compilePlan(plan.beats, ctx);
  console.log('INITIAL:', report.status, report.violations.map(v => `${v.rule}@${v.beatIndex}:${v.severity}`).join(' '));
  for (const b of plan.beats) console.log(' ', b.index, b.type, '|', b.location, '|', b.timeOfDay, '|', b.cast.join(','));
  const writeCtx = { show: { id: ep.show.id, title: ep.show.title, premise: ep.show.premise, genre: ep.show.genre, visualStyle: ep.show.visualStyle, seed: ep.show.seed, episodeCount: ep.show.episodeCount, mode: ep.show.mode }, characters: characters.map(c => ({ name: c.name, role: c.role, appearance: c.appearance, personality: c.personality })), locations: entities.filter(e => e.kind === 'LOCATION').map(e => ({ name: e.name, desc: e.desc })), props: entities.filter(e => e.kind === 'PROP').map(e => ({ name: e.name, desc: e.desc })), episodeNumber: ep.number, priorSummaries: [] };
  const result = await repairLoop(writeCtx as never, ctx, plan, report);
  console.log('RESULT:', result.report.status, 'loops:', result.loops, 'method:', result.method);
  console.log('violations:', result.report.violations.map(v => `${v.rule}@${v.beatIndex}:${v.severity} ${v.message.slice(0, 80)}`).join('\n  '));
  await db.$disconnect();
}
main();

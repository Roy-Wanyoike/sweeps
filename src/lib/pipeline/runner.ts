import { db } from '@/lib/db';
import { Beat, CompileReport, jparse, normKey } from '@/lib/contracts';
import { generateBible, generateReferenceStills } from '@/services/bible';
import { generatePlan, WriteCtx } from '@/services/writer';
import { CompileCtx, compilePlan, fixtureCtx } from '@/services/compiler';
import { repairLoop } from '@/services/repairer';
import { renderEpisode } from '@/services/renderer';
import { ensurePanel, simulateScreening } from '@/services/audience';
import { computeMetrics } from '@/services/analytics';
import { prepareTreatmentDirectives } from '@/services/optimizer';

/**
 * Pipeline state machine + in-process job queue.
 * DRAFT → WRITING → COMPILING ⟲(≤3) → RENDERING → SCREENING → ANALYZING → DONE
 * Every step persists its output + a JobLog before advancing (crash-safe resume).
 */

type Job = { kind: 'bible'; showId: string } | { kind: 'episode'; episodeId: string };

interface RunnerState {
  queue: Job[];
  running: boolean;
  current?: Job;
  lastError?: string;
}

const g = globalThis as unknown as { __sweepsRunner?: RunnerState };
function state(): RunnerState {
  if (!g.__sweepsRunner) g.__sweepsRunner = { queue: [], running: false };
  return g.__sweepsRunner;
}

export function runnerStatus(): { queued: number; running: boolean; current?: Job; lastError?: string } {
  const s = state();
  return { queued: s.queue.length, running: s.running, current: s.current, lastError: s.lastError };
}

export function enqueue(jobs: Job[]): void {
  state().queue.push(...jobs);
  if (!state().running) {
    void drain();
  }
}

async function drain(): Promise<void> {
  const s = state();
  s.running = true;
  try {
    while (s.queue.length > 0) {
      const job = s.queue.shift();
      if (!job) break;
      s.current = job;
      try {
        if (job.kind === 'bible') await runBibleJob(job.showId);
        else await runEpisodePipeline(job.episodeId);
      } catch (err) {
        s.lastError = err instanceof Error ? err.message : String(err);
        if (job.kind === 'episode') {
          await db.jobLog
            .create({
              data: {
                episodeId: job.episodeId,
                step: 'PIPELINE',
                status: 'ERROR',
                detail: s.lastError,
              },
            })
            .catch(() => undefined);
          // honest status: this is a runtime crash, not a gate rejection —
          // enqueueDemo resumes these from their persisted artifacts.
          await db.episode
            .update({ where: { id: job.episodeId }, data: { status: 'PIPELINE_ERROR' } })
            .catch(() => undefined);
        }
      } finally {
        s.current = undefined;
      }
    }
  } finally {
    s.running = false;
  }
}

async function log(episodeId: string | null, showId: string | null, step: string, status: string, detail?: unknown): Promise<void> {
  await db.jobLog
    .create({
      data: {
        episodeId,
        showId,
        step,
        status,
        detail: detail === undefined ? null : JSON.stringify(detail).slice(0, 2000),
      },
    })
    .catch(() => undefined);
}

async function runBibleJob(showId: string): Promise<void> {
  await generateReferenceStills(showId);
}

async function buildCompileCtx(showId: string, budgetUsd: number): Promise<CompileCtx> {
  const [characters, entities, show] = await Promise.all([
    db.character.findMany({ where: { showId } }),
    db.worldEntity.findMany({ where: { showId } }),
    db.show.findUnique({ where: { id: showId } }),
  ]);
  const charactersMap = new Map<string, { attrs: Record<string, string>; refImage: boolean }>();
  for (const c of characters) {
    charactersMap.set(normKey(c.name), { attrs: jparse<Record<string, string>>(c.attrs, {}), refImage: Boolean(c.refImage) });
  }
  const locations = new Set<string>();
  const props = new Set<string>();
  for (const e of entities) {
    if (e.kind === 'LOCATION') locations.add(normKey(e.name));
    else props.add(normKey(e.name));
  }
  const priorLore: Record<string, string> = jparse<Record<string, string>>(show?.lore ?? null, {});
  return {
    characters: charactersMap,
    locations,
    props,
    priorLore,
    renderBudgetUsd: budgetUsd * 0.45,
    renderMode: 'STILLS',
  };
}

export async function compileEpisodeNow(episodeId: string): Promise<CompileReport | null> {
  const episode = await db.episode.findUnique({ where: { id: episodeId }, include: { show: true } });
  if (!episode) return null;
  const beats = jparse<Beat[]>(episode.beatPlan, []);
  const ctx = await buildCompileCtx(episode.showId, episode.show.budgetUsd);
  return compilePlan(beats, ctx);
}

/** Compile the shipped bad-beat fixture against its own self-contained context. */
export async function compileFixture(): Promise<CompileReport | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const file = path.join(process.cwd(), 'fixtures', 'bad-beat.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Beat[];
    return compilePlan(raw, fixtureCtx(raw));
  } catch {
    return null;
  }
}

export async function runEpisodePipeline(episodeId: string): Promise<void> {
  const episode = await db.episode.findUnique({ where: { id: episodeId }, include: { show: true } });
  if (!episode) return;
  const show = episode.show;
  if (episode.status === 'DONE' || episode.status === 'COMPILE_FAILED') return;

  await db.show.update({ where: { id: show.id }, data: { status: 'RUNNING' } });

  /* ---------------- artifact-based crash-safe resume ----------------
   * Each stage skips itself when its output is already persisted, so a
   * PIPELINE_ERROR resume continues where the crash happened instead of
   * re-spending WRITER tokens on a finished plan.
   */
  const storedPlan = jparse<Beat[] | { beats: Beat[] } | null>(episode.beatPlan, []);
  const existingBeats = Array.isArray(storedPlan) ? storedPlan : (storedPlan?.beats ?? []);
  const hasPlan = existingBeats.length > 0;
  const storedReport = jparse<CompileReport | null>(episode.compileReport, null);
  const hasCompile = hasPlan && !!storedReport && storedReport.status !== 'FAIL';
  const renderedCount = await db.beat.count({
    where: { episodeId, OR: [{ stillPath: { not: null } }, { renderStatus: 'SKIPPED' }] },
  });
  const hasRender = hasCompile && renderedCount > 0;
  const screeningCount = await db.screening.count({ where: { episodeId } });
  const hasScreening = hasRender && screeningCount > 0;

  const [characters, entities] = await Promise.all([
    db.character.findMany({ where: { showId: show.id } }),
    db.worldEntity.findMany({ where: { showId: show.id } }),
  ]);
  const ctx: WriteCtx = {
    show: {
      id: show.id,
      title: show.title,
      premise: show.premise,
      genre: show.genre,
      visualStyle: show.visualStyle,
      seed: show.seed,
      episodeCount: show.episodeCount,
      mode: show.mode,
    },
    characters: characters.map((c) => ({ name: c.name, role: c.role, appearance: c.appearance, personality: c.personality })),
    locations: entities.filter((e) => e.kind === 'LOCATION').map((e) => ({ name: e.name, desc: e.desc })),
    props: entities.filter((e) => e.kind === 'PROP').map((e) => ({ name: e.name, desc: e.desc })),
    episodeNumber: episode.number,
    priorSummaries: [],
  };

  let beats: Beat[] = existingBeats;
  let report: CompileReport | null = storedReport;
  let loops = episode.repairLoops;
  let summary = episode.summary ?? '';

  /* ------------------------------ WRITING ------------------------------ */
  if (!hasPlan) {
    await db.episode.update({ where: { id: episodeId }, data: { status: 'WRITING' } });
    await log(episodeId, show.id, 'WRITING', 'STARTED');
    const priorEps = await db.episode.findMany({
      where: { showId: show.id, arm: episode.arm, number: { lt: episode.number }, status: 'DONE' },
      orderBy: { number: 'asc' },
    });
    ctx.priorSummaries = priorEps.map((e) => ({ number: e.number, summary: e.summary ?? '' }));

    // Paired dual-arm design: both arms premiere with the IDENTICAL episode, so
    // ep2+ divergence is attributable to the optimizer loop — not to premiere luck.
    let reused = false;
    if (episode.number === 1 && show.mode === 'DUAL') {
      const twinArm = episode.arm === 'A' ? 'B' : 'A';
      const twin = await db.episode.findFirst({
        where: { showId: show.id, number: 1, arm: twinArm, status: 'DONE' },
      });
      const twinPlan = twin ? jparse<{ beats: Beat[]; summary: string } | null>(twin.beatPlan, null) : null;
      if (twinPlan && Array.isArray(twinPlan.beats) && twinPlan.beats.length > 0) {
        beats = twinPlan.beats;
        summary = twinPlan.summary ?? '';
        report = null;
        loops = 0;
        reused = true;
      }
    }

    // treatment arm: feed measured analytics + optimizer directives
    let directives: Awaited<ReturnType<typeof prepareTreatmentDirectives>> = [];
    if (!reused) {
      if (episode.arm === 'B' && episode.number > 1) {
        const prevMetrics = await computeMetrics(priorEps[priorEps.length - 1]?.id ?? '');
        if (prevMetrics && prevMetrics.cliffs.length > 0) {
          ctx.analyticsBlock = prevMetrics.cliffs
            .map((c) => `- beat ${c.beat} [${c.type}] "${c.title}" dropped ${(c.delta * 100).toFixed(1)} pts${c.quote ? ` — viewer: "${c.quote}"` : ''}`)
            .join('\n');
        }
        directives = await prepareTreatmentDirectives(ctx, episode.number);
        ctx.directives = directives;
      }
      const plan = await generatePlan(ctx);
      beats = plan.beats;
      summary = plan.summary;
      report = null;
      loops = 0;
    }
    await db.beat.deleteMany({ where: { episodeId } });
    await db.episode.update({
      where: { id: episodeId },
      data: {
        status: 'COMPILING',
        beatPlan: JSON.stringify({ beats, summary }),
        summary,
        repairLoops: 0,
        beats: {
          create: beats.map((b) => ({
            index: b.index,
            type: b.type,
            title: b.title,
            payload: JSON.stringify(b),
          })),
        },
      },
    });
    await log(episodeId, show.id, 'WRITING', 'OK', {
      beats: beats.length,
      directives: directives.length,
      reusedFrom: reused ? (episode.arm === 'A' ? 'B' : 'A') : undefined,
    });
  }

  /* ----------------------------- COMPILING ----------------------------- */
  if (!hasCompile) {
    await db.episode.update({ where: { id: episodeId }, data: { status: 'COMPILING' } });
    await log(episodeId, show.id, 'COMPILING', 'STARTED');
    if (!beats.length) {
      // plan lost between steps (should not happen) — cannot continue
      throw new Error('no beat plan to compile');
    }
    const compileCtx = await buildCompileCtx(show.id, show.budgetUsd);
    let rep = compilePlan(beats, compileCtx);
    const initialViolations = rep.violations.length;
    let method = 'PASS_AS_IS';
    if (rep.status === 'FAIL') {
      const result = await repairLoop(ctx, await buildCompileCtx(show.id, show.budgetUsd), { beats, summary }, rep);
      beats = result.plan.beats;
      rep = result.report;
      loops = result.loops;
      method = result.method;
    }
    report = rep;
    if (report.status === 'FAIL') {
      await db.episode.update({
        where: { id: episodeId },
        data: { status: 'COMPILE_FAILED', compileReport: JSON.stringify(report), beatPlan: JSON.stringify({ beats, summary }), repairLoops: loops },
      });
      await db.beat.deleteMany({ where: { episodeId } });
      await db.beat.createMany({
        data: beats.map((b) => ({ episodeId, index: b.index, type: b.type, title: b.title, payload: JSON.stringify(b) })),
      });
      await log(episodeId, show.id, 'COMPILING', 'ERROR', { status: report.status, initialViolations, violations: report.violations.length, loops, method });
      return;
    }
    await db.beat.deleteMany({ where: { episodeId } });
    await db.beat.createMany({
      data: beats.map((b) => ({
        episodeId,
        index: b.index,
        type: b.type,
        title: b.title,
        payload: JSON.stringify(b),
        compileStatus: rep.status,
      })),
    });
    await db.episode.update({
      where: { id: episodeId },
      data: { status: 'RENDERING', beatPlan: JSON.stringify({ beats, summary }), compileReport: JSON.stringify(report), repairLoops: loops },
    });
    await log(episodeId, show.id, 'COMPILING', 'OK', { status: report.status, violations: report.violations.length, loops, method });
  }

  /* ----------------------------- RENDERING ----------------------------- */
  if (!hasRender) {
    await db.episode.update({ where: { id: episodeId }, data: { status: 'RENDERING' } });
    await log(episodeId, show.id, 'RENDERING', 'STARTED');
    const render = await renderEpisode(episodeId);
    await log(episodeId, show.id, 'RENDERING', 'OK', render);
  }

  /* ----------------------------- SCREENING ----------------------------- */
  if (!hasScreening) {
    await db.episode.update({ where: { id: episodeId }, data: { status: 'SCREENING' } });
    await log(episodeId, show.id, 'SCREENING', 'STARTED');
    await ensurePanel(show.id);
    const screened = await simulateScreening(episodeId);
    await log(episodeId, show.id, 'SCREENING', 'OK', { panel: screened });
  }

  /* ----------------------------- ANALYZING ----------------------------- */
  await db.episode.update({ where: { id: episodeId }, data: { status: 'ANALYZING' } });
  const metrics = await computeMetrics(episodeId);
  await log(episodeId, show.id, 'ANALYZING', 'OK', {
    overall: metrics?.overall,
    cliffs: metrics?.cliffs.length,
  });
  await db.episode.update({ where: { id: episodeId }, data: { status: 'DONE' } });

  // show-level status
  const remaining = await db.episode.count({ where: { showId: show.id, status: { notIn: ['DONE', 'COMPILE_FAILED'] } } });
  if (remaining === 0 && state().queue.length === 0) {
    await db.show.update({ where: { id: show.id }, data: { status: 'DONE' } });
  }
}

/** Queue the full dual-arm demo: ep1A, ep1B, ep2A, ep2B, ... */
export async function enqueueDemo(showId: string): Promise<number> {
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) return 0;
  await ensurePanel(showId);
  const jobs: Job[] = [];
  const arms = show.mode === 'DUAL' ? ['A', 'B'] : ['A'];
  for (let n = 1; n <= show.episodeCount; n++) {
    for (const arm of arms) {
      const existing = await db.episode.findUnique({
        where: { showId_number_arm: { showId, number: n, arm } },
      });
      if (existing && existing.status === 'DONE') continue;
      if (existing && existing.status === 'COMPILE_FAILED') {
        // gate rejection: wipe artifacts so the writer produces a FRESH plan,
        // then run the full pipeline again (bounded by the same gates).
        await db.episode.update({
          where: { id: existing.id },
          data: { status: 'DRAFT', beatPlan: null, summary: null, compileReport: null, repairLoops: 0, spendUsd: 0, retentionScore: null },
        });
        await db.beat.deleteMany({ where: { episodeId: existing.id } });
        await db.screening.deleteMany({ where: { episodeId: existing.id } });
        jobs.push({ kind: 'episode', episodeId: existing.id });
        continue;
      }
      if (existing && existing.status === 'PIPELINE_ERROR') {
        // runtime crash: keep persisted artifacts and resume from the failed stage
        jobs.push({ kind: 'episode', episodeId: existing.id });
        continue;
      }
      const ep =
        existing ??
        (await db.episode.create({ data: { showId, number: n, arm, status: 'DRAFT' } }));
      jobs.push({ kind: 'episode', episodeId: ep.id });
    }
  }
  const missingStills = await db.character.count({ where: { showId, refImage: null } });
  if (missingStills > 0) jobs.unshift({ kind: 'bible', showId });
  enqueue(jobs);
  return jobs.length;
}

/** Queue a single next episode for one arm. */
export async function enqueueNextEpisode(showId: string, arm: string): Promise<string | null> {
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) return null;
  const count = await db.episode.count({ where: { showId, arm } });
  if (count >= show.episodeCount) return null;
  const ep = await db.episode.create({ data: { showId, number: count + 1, arm, status: 'DRAFT' } });
  const jobs: Job[] = [];
  const missingStills = await db.character.count({ where: { showId, refImage: null } });
  if (missingStills > 0) jobs.push({ kind: 'bible', showId });
  jobs.push({ kind: 'episode', episodeId: ep.id });
  enqueue(jobs);
  return ep.id;
}

/** Create a show with generated bible + panel (bible LLM synchronous, stills queued). */
export async function createShowWithBible(input: {
  premise: string;
  title?: string;
  genre?: string;
  visualStyle?: string;
  mode?: string;
  episodeCount?: number;
  budgetUsd?: number;
  panelSize?: number;
  seed?: number;
}): Promise<string> {
  const seed = input.seed ?? Math.floor(Date.now() % 1_000_000_000);
  const show = await db.show.create({
    data: {
      title: input.title ?? 'Untitled',
      premise: input.premise,
      genre: input.genre ?? 'drama',
      visualStyle: input.visualStyle ?? 'cinematic',
      mode: input.mode ?? 'DUAL',
      episodeCount: Math.min(6, Math.max(1, input.episodeCount ?? 3)),
      budgetUsd: Math.min(50, Math.max(1, input.budgetUsd ?? 5)),
      panelSize: Math.min(2000, Math.max(50, input.panelSize ?? 200)),
      seed,
    },
  });
  await generateBible(show);
  await ensurePanel(show.id);
  const missingStills = await db.character.count({ where: { showId: show.id, refImage: null } });
  if (missingStills > 0) enqueue([{ kind: 'bible', showId: show.id }]);
  return show.id;
}

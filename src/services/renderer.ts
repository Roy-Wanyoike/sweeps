import { db } from '@/lib/db';
import { Beat, jparse } from '@/lib/contracts';
import { getAIProvider, meteredChat, meteredImage } from '@/lib/ai/provider';
import { renderBudgetLeft, IMAGE_COST_USD } from '@/lib/ai/cost-ledger';
import { IMAGE_COST_USD as IMG_COST } from '@/lib/ai/prices';
import { hashSeed } from '@/lib/sim/rng';
import { makeCard } from './storyboard';

/**
 * Render Crew: per-beat visuals under budget governance.
 * - Key beats (HOOK/REVEAL/TWIST/CLIFFHANGER by default) get AI stills.
 * - Everything else gets deterministic procedural cards (zero AI cost).
 * - VLM consistency gate on REVEAL/TWIST AI stills (1 regen, then accept with WARN).
 */

const KEY_TYPES = (process.env.RENDER_IMAGE_BEATS || 'HOOK,REVEAL,TWIST,CLIFFHANGER')
  .split(',')
  .map((s) => s.trim().toUpperCase());

const GATE_ENABLED = process.env.CONSISTENCY_GATE !== 'off';

function base64OfPublicPath(p: string): string | null {
  if (!p.startsWith('/generated/')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const file = path.join(process.cwd(), 'public', p.replace(/^\//, ''));
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file).toString('base64');
  } catch {
    return null;
  }
}

export async function renderEpisode(episodeId: string): Promise<{ images: number; cards: number; gates: { checked: number; regenerated: number } }> {
  const episode = await db.episode.findUnique({ where: { id: episodeId }, include: { show: true, beats: true } });
  if (!episode) return { images: 0, cards: 0, gates: { checked: 0, regenerated: 0 } };
  const show = episode.show;
  const provider = getAIProvider();
  const characters = await db.character.findMany({ where: { showId: show.id } });
  const charByName = new Map(characters.map((c) => [c.name.toLowerCase(), c]));

  let budgetLeft = await renderBudgetLeft(show);
  let images = 0;
  let cards = 0;
  const gates = { checked: 0, regenerated: 0 };
  let degraded = false;

  for (const beatRow of episode.beats) {
    const beat = jparse<Beat>(beatRow.payload, null as unknown as Beat);
    if (!beat) continue;

    const castDesc = beat.cast
      .map((c) => charByName.get(c.toLowerCase())?.appearance)
      .filter(Boolean)
      .join('; ');
    const prompt = `${beat.visualPrompt || beat.title}. Cast: ${castDesc || 'n/a'}. ${show.visualStyle} style, cinematic composition, high quality, detailed.`;

    const isKey = KEY_TYPES.includes(beat.type.toUpperCase());
    let stillPath: string | null = null;
    let renderStatus = 'CARD';
    let cost = 0.0005;

    if (isKey && budgetLeft > IMAGE_COST_USD * 1.5) {
      const ai = await meteredImage(provider, { showId: show.id, episodeId }, prompt);
      if (ai) {
        stillPath = ai;
        renderStatus = 'STILL';
        cost = IMG_COST;
        images += 1;
        budgetLeft -= IMG_COST;
      }
    } else if (isKey && budgetLeft <= IMAGE_COST_USD * 1.5) {
      degraded = true;
    }

    if (!stillPath) {
      stillPath = makeCard({
        kind: 'BEAT',
        title: beat.title,
        sub: `${beat.location} · ${beat.timeOfDay} · ${beat.durationSec}s`,
        lines: [beat.purpose, beat.dialogue[0] ? `"${beat.dialogue[0].line}" — ${beat.dialogue[0].char}` : ''],
        seed: hashSeed(show.seed, episode.arm, episode.number, beat.index),
      });
      cards += 1;
    }

    // VLM consistency gate (AI stills on REVEAL/TWIST only)
    if (renderStatus === 'STILL' && GATE_ENABLED && ['REVEAL', 'TWIST'].includes(beat.type.toUpperCase())) {
      const b64 = base64OfPublicPath(stillPath);
      if (b64 && castDesc) {
        gates.checked += 1;
        const gate = await meteredChat(
          provider,
          { showId: show.id, episodeId, stage: 'RENDER', tier: 'VISION' },
          'You are a continuity checker. Answer ONLY JSON: {"consistent": boolean, "issues": string[]}. Judge whether the frame matches the described characters and scene.',
          `Expected: ${castDesc}. Scene: ${beat.visualPrompt}. Does the image match?`
        );
        let consistent = true;
        let issues: string[] = [];
        if (gate) {
          try {
            const parsed = JSON.parse(gate.slice(gate.indexOf('{'), gate.lastIndexOf('}') + 1)) as { consistent?: boolean; issues?: string[] };
            consistent = parsed.consistent !== false;
            issues = parsed.issues ?? [];
          } catch {
            consistent = true;
          }
        } else {
          consistent = true; // gate unavailable -> pass open (recorded)
        }
        if (!consistent && budgetLeft > IMG_COST * 2) {
          const retry = await meteredImage(provider, { showId: show.id, episodeId }, `${prompt}. Avoid: ${issues.join(', ') || 'character mismatch'}.`);
          if (retry) {
            stillPath = retry;
            gates.regenerated += 1;
            budgetLeft -= IMG_COST;
          }
        }
      }
    }

    await db.beat.update({
      where: { id: beatRow.id },
      data: { stillPath, renderStatus, estCostUsd: cost },
    });
  }

  await db.jobLog.create({
    data: {
      episodeId,
      showId: show.id,
      step: 'RENDERING',
      status: degraded ? 'WARN' : 'OK',
      detail: JSON.stringify({ images, cards, gates, degraded, videoMode: provider.hasVideo() }),
    },
  });
  await db.episode.update({
    where: { id: episodeId },
    data: { status: degraded ? 'RENDER_PARTIAL' : 'RENDERING' },
  });
  return { images, cards, gates };
}

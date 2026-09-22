import { z } from 'zod';
import { db } from '@/lib/db';
import { getAIProvider, meteredChat, meteredImage } from '@/lib/ai/provider';
import { normKey, jparse } from '@/lib/contracts';
import { hashSeed } from '@/lib/sim/rng';
import { makeCard } from './storyboard';

const BibleSchema = z.object({
  title: z.string().default('Untitled'),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().default(''),
        appearance: z.string().default(''),
        personality: z.string().default(''),
        voiceStyle: z.string().default('measured'),
        attrs: z.record(z.string(), z.string()).default({}),
      })
    )
    .min(2)
    .max(6),
  locations: z.array(z.object({ name: z.string().min(1), desc: z.string().default('') })).min(2).max(6),
  props: z.array(z.object({ name: z.string().min(1), desc: z.string().default('') })).min(2).max(6),
});

export interface BibleData {
  title: string;
  characters: z.infer<typeof BibleSchema>['characters'];
  locations: z.infer<typeof BibleSchema>['locations'];
  props: z.infer<typeof BibleSchema>['props'];
}

/** Deterministic fallback bible — always compiles, always renders. */
export function templateBible(premise: string): BibleData {
  return {
    title: 'THE LAST SIGNAL',
    characters: [
      {
        name: 'Mara Voss',
        role: 'investigative journalist',
        appearance: 'woman in her late 30s, close-cropped dark hair, grey trench coat, tired sharp eyes',
        personality: 'relentless, guilt-driven, allergic to authority',
        voiceStyle: 'clipped and dry',
        attrs: { employer: 'The Meridian Post', goal: 'expose theSignal cover-up', weakness: 'insomnia' },
      },
      {
        name: 'Dexter Hale',
        role: 'police fixer',
        appearance: 'heavyset man, shaved head, oxidized silver ring, off-white shirt',
        personality: 'transactional, quietly sentimental',
        voiceStyle: 'low and unhurried',
        attrs: { employer: 'precinct 19', goal: 'keep his name off the ledger', weakness: 'his daughter' },
      },
      {
        name: 'Evelyn Marsh',
        role: 'media mogul',
        appearance: 'immaculate woman in her 60s, bone-white blazer, pearl studs',
        personality: 'patient, ruthless, allergic to loose ends',
        voiceStyle: 'silken and precise',
        attrs: { company: 'Marsh Media Group', goal: 'bury theSignal', weakness: 'her legacy' },
      },
    ],
    locations: [
      { name: 'Rain-Slick Precinct', desc: 'a 19th-century police atrium dripping with humidity' },
      { name: 'Rooftop Newsroom', desc: 'tarp-covered desks under a blinking antenna' },
      { name: 'Underground Archive', desc: 'floodlit basement stacks of severed files' },
    ],
    props: [
      { name: 'Stolen Ledger', desc: 'a water-warred accounting book' },
      { name: 'Burner Phone', desc: 'a cracked prepaid phone with one contact' },
    ],
  };
}

export async function generateBible(show: {
  id: string;
  title: string;
  premise: string;
  genre: string;
  visualStyle: string;
  budgetUsd: number;
}): Promise<BibleData> {
  const provider = getAIProvider();
  const system = `You are a TV bible generator. Respond with ONLY JSON: {"title": "...", "characters":[{"name","role","appearance","personality","voiceStyle","attrs":{k:v,...}}], "locations":[{"name","desc"}], "props":[{"name","desc"}]}. 3 characters, 3 locations, 2-3 props. Names are short proper nouns. attrs are 2-3 structured facts (employer, goal, weakness).`;
  const user = `Premise: ${show.premise}\nGenre: ${show.genre}\nVisual style: ${show.visualStyle}`;
  let data: BibleData | null = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const text = await meteredChat(provider, { showId: show.id, stage: 'BIBLE', tier: 'BIG' }, system, attempt === 0 ? user : `${user}\n\nPrevious attempt failed schema validation. Return strictly valid JSON.`);
    if (!text) break;
    try {
      const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const parsed = BibleSchema.safeParse(JSON.parse(jsonText));
      if (parsed.success) data = parsed.data;
    } catch {
      /* retry */
    }
  }
  const bible = data ?? templateBible(show.premise);

  // Persist
  await db.character.deleteMany({ where: { showId: show.id } });
  await db.worldEntity.deleteMany({ where: { showId: show.id } });
  for (const c of bible.characters) {
    await db.character.create({
      data: {
        showId: show.id,
        name: c.name,
        role: c.role,
        appearance: c.appearance,
        personality: c.personality,
        voiceStyle: c.voiceStyle,
        attrs: JSON.stringify(c.attrs),
      },
    });
  }
  for (const l of bible.locations) {
    await db.worldEntity.create({ data: { showId: show.id, kind: 'LOCATION', name: l.name, desc: l.desc } });
  }
  for (const p of bible.props) {
    await db.worldEntity.create({ data: { showId: show.id, kind: 'PROP', name: p.name, desc: p.desc } });
  }

  // Seed committed lore from structured attrs (compiler source of truth)
  const lore: Record<string, string> = {};
  for (const c of bible.characters) {
    for (const [k, v] of Object.entries(c.attrs)) {
      lore[`bible:${normKey(c.name)}:${normKey(k)}`] = String(v);
    }
  }
  await db.show.update({ where: { id: show.id }, data: { title: bible.title || show.title, lore: JSON.stringify(lore) } });
  return bible;
}

/** Background job: reference stills for characters + key art for first location. */
export async function generateReferenceStills(showId: string): Promise<void> {
  const show = await db.show.findUnique({ where: { id: showId } });
  if (!show) return;
  const provider = getAIProvider();
  const characters = await db.character.findMany({ where: { showId } });
  for (const c of characters) {
    if (c.refImage) continue;
    const prompt = `Character portrait, ${c.role}: ${c.name}. ${c.appearance}. ${show.visualStyle} style, cinematic rim lighting, moody background, high quality, detailed.`;
    const ai = await meteredImage(provider, { showId }, prompt);
    const path =
      ai ??
      makeCard({
        kind: 'CHARACTER',
        title: c.name,
        sub: c.role,
        lines: [c.appearance, c.personality],
        seed: hashSeed(show.seed, c.name),
      });
    await db.character.update({ where: { id: c.id }, data: { refImage: path } });
  }
  const locs = await db.worldEntity.findMany({ where: { showId, kind: 'LOCATION' }, take: 2 });
  for (const l of locs) {
    const prompt = `Establishing shot of "${l.name}" — ${l.desc}. ${show.visualStyle} style, cinematic composition, atmospheric, high quality.`;
    const ai = await meteredImage(provider, { showId }, prompt);
    if (ai) {
      await db.worldEntity.update({ where: { id: l.id }, data: { refImage: ai } });
    } else {
      await db.worldEntity.update({
        where: { id: l.id },
        data: {
          refImage: makeCard({ kind: 'LOCATION', title: l.name, sub: l.desc, seed: hashSeed(show.seed, l.name) }),
        },
      });
    }
  }
}

export function buildLoreMap(showLore: string | null): Record<string, string> {
  return jparse<Record<string, string>>(showLore, {});
}

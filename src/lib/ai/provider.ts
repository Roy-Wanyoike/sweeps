import ZAI from 'z-ai-web-dev-sdk';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { tokensOf, textCostUsd } from '@/lib/ai/prices';
import { recordCost, type Stage } from '@/lib/ai/cost-ledger';

export type Tier = 'BIG' | 'FAST' | 'VISION';

export interface ChatRequest {
  system: string;
  user: string;
  tier: Tier;
  maxTokens?: number;
  /** Optional data URI for vision calls (VISION tier). */
  imageDataUrl?: string;
}

export interface AIProvider {
  name: string;
  chatModel(tier: Tier): string;
  chat(req: ChatRequest): Promise<string | null>;
  /** Returns a public URL path like /generated/<hash>.png, or null. */
  image(req: { prompt: string }): Promise<string | null>;
  hasVideo(): boolean;
}

/* ------------------------------ z-ai (sandbox) ------------------------------ */

type ZAIInstance = Awaited<ReturnType<typeof ZAI.create>>;

const g = globalThis as unknown as { __sweepsZAI?: ZAIInstance };

async function zai(): Promise<ZAIInstance | null> {
  try {
    if (!g.__sweepsZAI) g.__sweepsZAI = await ZAI.create();
    return g.__sweepsZAI;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('ai-timeout')), ms)),
  ]);
}

const GEN_DIR = path.join(process.cwd(), 'public', 'generated');

function ensureGenDir(): void {
  if (!fs.existsSync(GEN_DIR)) fs.mkdirSync(GEN_DIR, { recursive: true });
}

export function saveGeneratedImage(base64: string): string {
  ensureGenDir();
  const hash = crypto.createHash('sha1').update(base64.slice(0, 4096) + Date.now()).digest('hex').slice(0, 16);
  const file = `${hash}.png`;
  fs.writeFileSync(path.join(GEN_DIR, file), Buffer.from(base64, 'base64'));
  return `/generated/${file}`;
}

/* ------------------------------- Sandbox impl ------------------------------- */

class SandboxProvider implements AIProvider {
  name = 'sandbox';

  chatModel(tier: Tier): string {
    return tier === 'BIG' ? 'sandbox-big' : tier === 'VISION' ? 'sandbox-vision' : 'sandbox-fast';
  }

  async chat(req: ChatRequest): Promise<string | null> {
    const client = await zai();
    if (!client) return null;
    try {
      const userContent: string | { type: string; text?: string; image_url?: { url: string } }[] = req.imageDataUrl
        ? [
            { type: 'text', text: req.user },
            { type: 'image_url', image_url: { url: req.imageDataUrl } },
          ]
        : req.user;
      const completion = await withTimeout(
        client.chat.completions.create({
          messages: [
            { role: 'system', content: req.system },
            // runtime accepts multimodal arrays for VLM calls; SDK types are string-only
            { role: 'user', content: userContent as string },
          ],
          thinking: { type: 'disabled' },
        }),
        90_000
      );
      const text = completion.choices[0]?.message?.content ?? null;
      return typeof text === 'string' && text.trim().length > 0 ? text : null;
    } catch {
      return null;
    }
  }

  async image(req: { prompt: string }): Promise<string | null> {
    const client = await zai();
    if (!client) return null;
    try {
      const res = await withTimeout(
        client.images.generations.create({ prompt: req.prompt, size: '1344x768' }),
        120_000
      );
      const base64 = res.data?.[0]?.base64;
      if (!base64) return null;
      return saveGeneratedImage(base64);
    } catch {
      return null;
    }
  }

  hasVideo(): boolean {
    return false;
  }
}

/* -------------------------------- Qwen impl -------------------------------- */

class QwenProvider implements AIProvider {
  name = 'qwen';
  private base = process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  private key = process.env.DASHSCOPE_API_KEY || '';

  chatModel(tier: Tier): string {
    return tier === 'BIG' ? 'qwen3.7-max' : tier === 'VISION' ? 'qwen-vl-plus' : 'qwen-plus';
  }

  async chat(req: ChatRequest): Promise<string | null> {
    if (!this.key) return null;
    try {
      const res = await withTimeout(
        fetch(`${this.base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.key}`,
          },
          body: JSON.stringify({
            model: this.chatModel(req.tier),
            messages: [
              { role: 'system', content: req.system },
              {
                role: 'user',
                content: req.imageDataUrl
                  ? [
                      { type: 'text', text: req.user },
                      { type: 'image_url', image_url: { url: req.imageDataUrl } },
                    ]
                  : req.user,
              },
            ],
            max_tokens: req.maxTokens ?? 4000,
          }),
        }),
        120_000
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? null;
      return text && text.trim().length > 0 ? text : null;
    } catch {
      return null;
    }
  }

  async image(): Promise<string | null> {
    // Wan/i2v integration point for the Qwen production path; degrade to cards.
    return null;
  }

  hasVideo(): boolean {
    return false;
  }
}

/* --------------------------------- Facade ---------------------------------- */

export function getAIProvider(): AIProvider {
  if (process.env.AI_PROVIDER === 'qwen' && process.env.DASHSCOPE_API_KEY) {
    return new QwenProvider();
  }
  return new SandboxProvider();
}

/** Metered chat: records cost then performs the call. */
export async function meteredChat(
  provider: AIProvider,
  opts: { showId: string; episodeId?: string | null; stage: Stage; tier: Tier; maxTokens?: number; imageDataUrl?: string },
  system: string,
  user: string
): Promise<string | null> {
  const model = provider.chatModel(opts.tier);
  const chars = system.length + user.length;
  await recordCost({
    showId: opts.showId,
    episodeId: opts.episodeId ?? null,
    stage: opts.stage,
    model,
    kind: 'LLM',
    tokens: tokensOf(chars),
    costUsd: textCostUsd(model, chars),
  });
  return provider.chat({ system, user, tier: opts.tier, maxTokens: opts.maxTokens, imageDataUrl: opts.imageDataUrl });
}

/** Metered image: records cost then performs generation. */
export async function meteredImage(
  provider: AIProvider,
  opts: { showId: string; episodeId?: string | null },
  prompt: string
): Promise<string | null> {
  await recordCost({
    showId: opts.showId,
    episodeId: opts.episodeId ?? null,
    stage: 'RENDER',
    model: 'image-gen',
    kind: 'IMAGE',
    costUsd: 0.04,
  });
  return provider.image({ prompt });
}

export { IMAGE_COST_USD } from '@/lib/ai/prices';

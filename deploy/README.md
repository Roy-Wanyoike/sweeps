# Deploying Sweeps with Qwen Cloud

Sweeps ships with two interchangeable AI providers behind one interface
(`src/lib/ai/provider.ts`):

| Mode | Env | Chat tiers | Vision | Notes |
|---|---|---|---|---|
| `sandbox` (default) | `AI_PROVIDER=sandbox` | `z-ai-web-dev-sdk` (`thinking: disabled`) | same client, image parts | zero API keys; images + TTS via the sandbox SDK; no video → Ken Burns fallback |
| `qwen` (production) | `AI_PROVIDER=qwen` | BIG→`qwen3.7-max`, FAST→`qwen-plus` | `qwen-vl-plus` | OpenAI-compatible DashScope endpoint; Wan i2v slot ready for `video()` |

## Switch to Qwen Cloud

```bash
cp .env.example .env
# edit .env:
#   AI_PROVIDER=qwen
#   QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
#   DASHSCOPE_API_KEY=sk-********
bun run db:push
bun run dev
```

Every JSON contract, Zod schema, compile rule, simulation formula and UI is
provider-agnostic: the sandbox and Qwen paths execute the same code and write
the same rows. `GET /api/health` reports the active provider.

## Deploy on Alibaba Cloud (sketch)

1. **Compute**: any Node 20+ host (ECS / Function Compute custom runtime / SAE).
   `bun run build && bun run start` (standalone output) or containerize with the
   included Next.js config.
2. **Database**: SQLite file on persistent volume (or swap `datasource db` to
   RDS PostgreSQL — Prisma makes this a one-line change).
3. **Secrets**: `DASHSCOPE_API_KEY` via KMS / env injection; never commit `.env`.
4. **Observability**: the built-in cost ledger (`/api/shows/:id/ledger`) doubles
   as a spend alarm — stage caps trigger the degradation ladder automatically.

## Hackathon track mapping

- **Track 2 — AI Showrunner** (primary): the full writing → compile → render →
  screen → optimize loop.
- **Track 1 — MemoryAgent** (cross): FSRS-inspired viewer memory with measured
  cliffhanger recall bonus (Audience tab → Memory inspector).
- **Track 3 — Agent Society** (cross): 200 persona-agents with archetype-shaped
  affinities, churn thresholds and social reaction wall.

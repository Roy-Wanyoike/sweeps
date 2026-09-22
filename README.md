# SWEEPS — The Retention-Optimized AI Showrunner

> Every AI showrunner can generate an episode. **Sweeps knows if anyone would watch.**

Sweeps writes a serialized drama as a pipeline of typed "beats," deterministically validates every
script through a **Continuity Compiler before spending a single generation token**, renders it,
then screens it in front of a **simulated audience of persona viewers** with persistent, decaying
memory. A Thompson-sampling optimizer rewrites the next episode against **measured retention** —
and a dual-arm experiment (writer-only control vs audience-optimized treatment) proves the loop.

## The five claims (all measurable in the dashboard)

1. **The Gate.** 8 deterministic compile rules (C1-CAST, C2-PRESENCE, C3-TIMELINE, C4-PROP,
   C5-WARDROBE, C6-LORE, C7-BUDGET, C8-DURATION) reject unrenderable/contradictory scripts for
   **0 generation tokens**, with machine-actionable fixes. Try it: *Episodes → "Test the Gate"*.
2. **Reproducible retention curves.** The audience simulator is fully seeded (mulberry32) — the
   same show seed produces byte-identical curves across runs.
3. **Causal memory.** Viewers hold FSRS-inspired memories with retrievability
   `R = exp(−Δep / 0.9·stability)`. A previous episode's cliffhanger with `R > 0.5` adds +0.10
   satisfaction to the next episode's HOOK (see *Audience → Memory inspector*).
4. **The loop wins.** Arm B consumes cliffs + viewer quotes + Thompson-sampled beat variants;
   the verdict card shows retention lift (B − A) and cost-per-retained-viewer per arm.
5. **Budget receipts.** Every AI call is metered (per-token / per-image) into a cost ledger with
   per-stage caps (Writer 25% / Render 45% / Audience 20% / Optimizer 8%) and an automatic
   degradation ladder (video→stills, reaction sampling, subsample shrinking).

## Architecture

```
Writer Agent ──▶ Continuity Compiler ──▶ Render Crew ──▶ Simulated Audience ──▶ Optimizer
 (beat plans)     (pure TS, 0 tokens)     (stills/cards)   (200 seeded personas)    (Thompson)
      ▲                                                                    │
      └──────────── beat plan for episode N+1 ◀────────────────────────────┘
```

- **Next.js 16 App Router + TypeScript** · single route dashboard (5 tabs) · API routes only
- **Prisma + SQLite** — Show / Character / WorldEntity / Episode / Beat / Viewer / ViewerMemory /
  Screening / Experiment / CostEntry / JobLog
- **AI provider abstraction** — `AI_PROVIDER=sandbox` (z-ai-web-dev-sdk, zero keys) or
  `AI_PROVIDER=qwen` (DashScope OpenAI-compatible: qwen3.7-max / qwen-plus / qwen-vl-plus; Wan
  video slot ready). Identical JSON contracts; metering in both.
- **Pipeline state machine** — `WRITING → COMPILING ⟲(≤3) → RENDERING → SCREENING → ANALYZING →
  DONE`, every step persisted + JobLog'd, crash-safe, resumable, in-process queue.

## Run it

```bash
bun run db:push   # sync schema
bun run dev       # http://localhost:3000
```

Then: **Create the demo show** (or New Show with any premise) → **Run Full Demo**.
DUAL mode runs Ep1A, Ep1B, Ep2A, Ep2B, Ep3A, Ep3B automatically.

## Measured numbers (from the last full run)

- Compile gate: fixture (`fixtures/bad-beat.json`) fails C2-PRESENCE + C4-PROP with 2 ERRORs and
  1 WARN — $0.00 spent (vs ~$0.72 estimated render cost saved).
- Panel: 200 viewers × 6 episodes; deterministic across seeds.
- Retention / lift / cost-per-retained-viewer: see the dashboard's Experiment tab (computed live
  from the DB, so numbers always reflect the actual run).

## Environment flags

| Flag | Default | Meaning |
|---|---|---|
| `AI_PROVIDER` | `sandbox` | `sandbox` (z-ai-web-dev-sdk) or `qwen` (DashScope) |
| `QWEN_BASE_URL` / `DASHSCOPE_API_KEY` | — | Qwen production path |
| `RENDER_IMAGE_BEATS` | `HOOK,REVEAL,TWIST,CLIFFHANGER` | which beat types get AI stills |
| `CONSISTENCY_GATE` | `on` | VLM consistency check on REVEAL/TWIST stills |

## Hackathon mapping

- **Track 2 — AI Showrunner**: full pipeline (script → storyboard → render → episode), token-budget
  aware, continuity-gated.
- **Cross-track 1 — MemoryAgent**: per-viewer FSRS memory drives measurable satisfaction.
- **Cross-track 3 — Agent Society**: 200 persona agents + writer + optimizer form a measured
  creative society; single-agent (control arm) baseline included by design.

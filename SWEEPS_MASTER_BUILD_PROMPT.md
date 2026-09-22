# SWEEPS — MASTER BUILD PROMPT
### Copy everything below this line into your AI builder (or hand it back to Z.ai Code). It is complete: architecture, technology, data model, algorithms, APIs, UI, milestones, verification, and scope boundaries.

---

## 1. ROLE & MISSION

You are a senior full-stack AI engineer. Build **Sweeps**, a web application that is a **retention-optimized AI showrunner**: it writes a serialized drama as a pipeline of typed "beats," deterministically validates every script through a **Continuity Compiler before spending a single generation token**, renders episodes, then screens them in front of a **simulated audience of hundreds of Qwen persona-agents** that watch, remember, rate, churn, and comment. An optimizer uses the measured retention data to rewrite the next episode. The system runs a **dual-arm experiment** (writer-only control vs audience-optimized treatment) and proves its value with retention curves, drop-off cliffs, statistical summaries, and a cost ledger — all visible in a live dashboard.

Build it end to end so it actually runs, with zero placeholders, zero TODOs, and a demo that produces real numbers. The application's thesis (and your acceptance bar): **"Losers generate content. Sweeps generates measured attention per dollar."**

## 2. PRODUCT DEFINITION

**One-liner:** An AI showrunner with a built-in simulated audience — every episode is A/B-measured on retention before it earns a season 2.

**The five product claims your build must make true and measurable:**
1. The Continuity Compiler rejects unrenderable/contradictory scripts for **0 generation tokens**, with machine-actionable fix suggestions the Writer Agent auto-repairs (bounded ≤ 3 loops).
2. The simulated audience produces **reproducible retention curves** (seeded, deterministic) with per-beat drop-off attribution.
3. Viewer agents have **persistent, decaying memory** (FSRS-inspired) that measurably affects next-episode satisfaction (cliffhanger recall bonus).
4. The optimizer's treatment arm beats the control arm on **retention delta across episodes** and on **cost-per-retained-viewer**.
5. Every API call is metered in a **cost ledger** with per-stage budget caps and a visible degradation ladder.

## 3. ENVIRONMENT & HARD CONSTRAINTS

- **Runtime:** Next.js 16 (App Router) + TypeScript (strict). Single visible route `/` (a tabbed dashboard). Dev server: `bun run dev`, port 3000, always in background; logs at `/home/z/my-project/dev.log`. Never run `bun run build`.
- **Database:** Prisma + SQLite (`db/` folder for the db file, `prisma/schema.prisma` for schema). Push with `bun run db:push`. Access only via `import { db } from '@/lib/db'`.
- **AI SDK:** `z-ai-web-dev-sdk` — **backend only** (API routes only, never client components). Provides: `chat.completions` (LLM), image generation, TTS, VLM, ASR. No server actions for mutations — use API routes.
- **Styling/UI:** Tailwind CSS 4 + shadcn/ui (New York) — use the pre-existing components in `src/components/ui`. Lucide icons. NO indigo/blue-dominant themes (use a warm neutral + amber/rose "studio" palette). Responsive, mobile-first. Sticky footer (`min-h-screen flex flex-col` + `mt-auto`). Long lists: `max-h-96 overflow-y-auto` + custom scrollbar. Loading skeletons, toasts, ARIA labels.
- **State:** Zustand (client) + TanStack Query (server state, polling for pipeline progress).
- **No** external DB, Redis, auth, or payments. No other routes besides `/`.
- All AI calls must work **without any user-provided API key** (sandbox provider), while remaining switchable to real Qwen Cloud (see §7).

## 4. TECH STACK (exact)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TS strict |
| UI | Tailwind 4, shadcn/ui (card, tabs, badge, button, dialog, progress, skeleton, sonner toast, scroll-area, table, tooltip, separator, select, switch, slider), Lucide |
| Charts | Recharts (retention lines, KM step chart, bar cliffs, cost curve) |
| DB/ORM | Prisma + SQLite |
| Client state | Zustand (active show, active episode, tab) |
| Server state | TanStack Query (poll 2s while a job is running) |
| Validation | Zod (all API inputs + all LLM outputs) |
| IDs/time | nanoid, ISO timestamps |
| Determinism | Custom seeded RNG (mulberry32) — no `Math.random` anywhere in the simulation path |
| Optional realtime | socket.io mini-service on port 3003 **only** for live pipeline logs (`io('/?XTransformPort=3003')`, path `/`); polling fallback is acceptable |

## 5. HIGH-LEVEL ARCHITECTURE

```
┌────────────────────────── Next.js (port 3000) ──────────────────────────┐
│  app/page.tsx  →  Studio Dashboard (5 tabs)                              │
│  app/api/*      →  REST route handlers (thin: validate → call services)  │
│                                                                        │
│  lib/pipeline/runner.ts   EPISODE STATE MACHINE (resumable, idempotent)  │
│    ├── services/writer.ts        Showrunner Agent (beat plan JSON)       │
│    ├── services/compiler.ts      Continuity Compiler (PURE TS, no AI)    │
│    ├── services/repairer.ts      bounded auto-repair loop (≤3)           │
│    ├── services/renderer.ts      Render Crew (stills / video / audio)    │
│    ├── services/audience.ts      Panel simulator (personas+memory+watch) │
│    ├── services/analytics.ts     KM, cliffs, segments (pure TS)          │
│    └── services/optimizer.ts     Thompson sampling over beat variants    │
│                                                                        │
│  lib/ai/provider.ts   PROVIDER ABSTRACTION (sandbox ↔ qwen) + METERING   │
│  lib/ai/cost-ledger.ts  per-call token/cost accounting + stage caps      │
│  lib/sim/rng.ts         mulberry32 seeded RNG                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Principles (non-negotiable):** deterministic code owns all decisions that must be auditable (compiler, simulator math, analytics, budget gates); LLMs only generate creative text/imagery inside those rails. Every LLM output is Zod-validated with one retry, then falls back to a deterministic default. Every step persists its output before advancing (crash-safe resume).

## 6. DATA MODEL (complete Prisma schema)

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = "file:../db/sweeps.db" }

model Show {
  id            String    @id @default(cuid())
  title         String
  premise       String
  genre         String
  visualStyle   String    // e.g. "cinematic anime", "gritty neon drama"
  mode          String    // 'SINGLE' | 'DUAL' (dual = control + treatment arms)
  episodeCount  Int       @default(3)
  budgetUsd     Float     @default(5.0)
  panelSize     Int       @default(200)
  seed          Int       // master seed: entire simulation is reproducible
  status        String    @default("SETUP") // SETUP|RUNNING|DONE
  createdAt     DateTime  @default(now())
  characters    Character[]
  entities      WorldEntity[]
  episodes      Episode[]
  viewers       Viewer[]
  experiments   Experiment[]
  costs         CostEntry[]
}

model Character {
  id          String  @id @default(cuid())
  showId      String
  show        Show    @relation(fields: [showId], references: [id])
  name        String
  role        String
  appearance  String     // structured: hair, eyes, outfit, distinguishing marks
  personality String
  voiceStyle  String
  refImage    String?    // URL/path of reference still
  attrs       String     // JSON: { age: 34, job: "...", quirks: ["..."] } (for C6-LORE)
}

model WorldEntity {
  id        String @id @default(cuid())
  showId    String
  show      Show   @relation(fields: [showId], references: [id])
  kind      String // 'LOCATION' | 'PROP'
  name      String
  desc      String
  refImage  String?
}

model Episode {
  id            String  @id @default(cuid())
  showId        String
  show          Show    @relation(fields: [showId], references: [id])
  number        Int
  arm           String  @default("A") // 'A' control | 'B' treatment | 'N/A'
  status        String  @default("DRAFT")
  // DRAFT|WRITING|COMPILING|COMPILE_FAILED|RENDERING|RENDER_PARTIAL|SCREENING|ANALYZING|DONE
  beatPlan      String? // JSON Beat[] (writer output, after repair)
  compileReport String? // JSON CompileReport (latest)
  repairLoops   Int     @default(0)
  spendUsd      Float   @default(0)
  retentionScore Float? // 0..1 overall retention (analytic output)
  createdAt     DateTime @default(now())
  beats         Beat[]
  screenings    Screening[]
  jobLogs       JobLog[]
  @@unique([showId, number, arm])
}

model Beat {
  id            String  @id @default(cuid())
  episodeId     String
  episode       Episode @relation(fields: [episodeId], references: [id])
  index         Int
  type          String  // HOOK|SETUP|ESCALATION|REVEAL|TWIST|CONFLICT|BREATH|CLIFFHANGER
  title         String
  payload       String  // JSON: full Beat contract (§8.1)
  compileStatus String? // PASS|WARN|FAIL
  renderStatus  String? @default("PENDING") // PENDING|STILL|VIDEO|FAILED|SKIPPED
  stillPath     String?
  videoPath     String?
  audioPath     String?
  estCostUsd    Float   @default(0)
  engagement    Float?  // mean panel satisfaction (filled by audience)
  dropCount     Int     @default(0)
}

model Viewer {
  id         String  @id @default(cuid())
  showId     String
  show       Show    @relation(fields: [showId], references: [id])
  name       String
  archetype  String
  persona    String  // JSON ViewerPersona (§8.4)
  seed       Int
  memories   ViewerMemory[]
  screenings Screening[]
}

model ViewerMemory {
  id             String  @id @default(cuid())
  viewerId       String
  viewer         Viewer  @relation(fields: [viewerId], references: [id])
  key            String  // e.g. "cliffhanger:ep1", "char:mara:betrayal"
  content        String
  stability      Float   // FSRS-inspired: grows on re-exposure
  lastSeenEp     Int
  lastSeenAt     DateTime @default(now())
  @@unique([viewerId, key])
}

model Screening {
  id           String   @id @default(cuid())
  episodeId    String
  episode      Episode  @relation(fields: [episodeId], references: [id])
  viewerId     String
  viewer       Viewer   @relation(fields: [viewerId], references: [id])
  seed         Int      // per-screening seed → reproducible
  keepWatching Boolean
  dropAtBeat   Int?
  satisfaction Float
  events       String   // JSON: per-beat watch events [{beat, s, S, recalled:[keys]}]
  comment      String?  // LLM comment (sampled subset only)
  sentiment    String?  // POSITIVE|NEUTRAL|NEGATIVE
}

model Experiment {
  id         String @id @default(cuid())
  showId     String
  show       Show   @relation(fields: [showId], references: [id])
  epNumber   Int
  slotIndex  Int        // which beat slot was A/B'd
  variantA   String     // JSON Beat
  variantB   String     // JSON Beat
  rewardA    Float?     // mean satisfaction of subsample
  rewardB    Float?
  chosen     String?    // 'A'|'B'
  evidence   String?    // JSON: n, delta, alpha/beta params
}

model CostEntry {
  id        String   @id @default(cuid())
  showId    String
  episodeId String?
  stage     String   // WRITER|COMPILER|RENDER|AUDIENCE|ANALYTICS|OPTIMIZER
  model     String
  kind      String   // LLM|IMAGE|VIDEO|TTS
  tokens    Int      @default(0)
  costUsd   Float
  createdAt DateTime @default(now())
}

model JobLog {
  id        String   @id @default(cuid())
  episodeId String
  episode   Episode  @relation(fields: [episodeId], references: [id])
  step      String
  status    String   // STARTED|OK|ERROR
  detail    String?  // JSON {ms, tokens, notes}
  createdAt DateTime @default(now())
}
```

## 7. AI PROVIDER LAYER (dual mode + metering)

`lib/ai/provider.ts` exposes one interface used by every service:

```ts
interface AIProvider {
  chat(req: { system: string; user: string; json: boolean; maxTokens: number; tier: 'BIG'|'FAST'|'VISION' }): Promise<string>;
  image(req: { prompt: string; w: number; h: number }): Promise<{ path: string }>;
  tts(req: { text: string; voice: string }): Promise<{ path: string }>;
  video?(req: { prompt: string; refImagePath?: string; seconds: number }): Promise<{ path: string }>;
}
```

- **Sandbox provider (default, `AI_PROVIDER=sandbox`):** uses `z-ai-web-dev-sdk` — `zai.chat.completions.create({ messages, thinking: { type: 'disabled' } })` for BIG/FAST tiers (one shared client), image generation for stills, TTS for dialogue audio. **No video function → `video()` is undefined; renderer falls back to "Ken Burns" mode** (stills + CSS/canvas pan-zoom playback in the UI player). Initialize via `ZAI.create()` in each route/service (server side only).
- **Qwen provider (`AI_PROVIDER=qwen`):** OpenAI-compatible client pointed at DashScope (`QWEN_BASE_URL`, `DASHSCOPE_API_KEY` env). Tier mapping: BIG→`qwen3.7-max`, FAST→`qwen-plus`, VISION→`qwen-vl-plus`; `video()`→Wan i2v/t2v; TTS→`qwen-tts`. Same JSON contracts, same code paths — this is the hackathon "production" mode with Alibaba Cloud deployment proof.
- **Metering middleware:** every call passes through `withMetering(stage, model, kind, fn)` → estimates tokens (chars/4 for text, fixed per image/second for media), computes cost from a static price table, writes a `CostEntry`, and enforces **stage budget caps** (WRITER 25% / RENDER 45% / AUDIENCE 20% / ANALYTICS+OPTIMIZER 10% of `show.budgetUsd`). At 90% of a stage cap, the **degradation ladder** engages automatically: video→stills, reaction comments sampled at 25%, panel subsample 200→80, TTS off. Budget state is always visible in the UI.

## 8. AGENT & ENGINE SPECIFICATIONS

### 8.1 Showrunner (Writer) Agent — `services/writer.ts`
- Model tier BIG. Inputs: premise, genre, style, character bibles, world entities, prior episode summaries, previous retention analytics (treatment arm only), and a **beat-slot directive** when the optimizer has chosen a variant.
- Output (Zod `BeatPlan`): array of 8–12 `Beat` objects:

```ts
type BeatType = 'HOOK'|'SETUP'|'ESCALATION'|'REVEAL'|'TWIST'|'CONFLICT'|'BREATH'|'CLIFFHANGER';
interface Beat {
  index: number; title: string; type: BeatType;
  location: string;                       // must match a LOCATION WorldEntity
  timeOfDay: 'DAWN'|'DAY'|'DUSK'|'NIGHT';
  durationSec: number;                    // 4–20
  castRefs: string[];                     // Character ids
  props: { ref: string; action: 'INTRODUCE'|'USE'|'DROP' }[];
  wardrobe: Record<string, string>;       // charId → outfit tag
  loreAssertions: { key: string; value: string }[];  // structured facts to persist
  visualPrompt: string;                   // for still/video generation
  dialogue: { charId: string; line: string; emotion: string }[];
  purpose: string;                        // narrative intent (optimizer reads this)
}
```
- Also emits per-beat `qualitySelfScore` (0..1) and a 2-sentence episode summary (stored for next-episode context and viewer memory seeds).
- Contract discipline: if Zod validation fails, retry once with the validation error appended; on second failure use the deterministic fallback plan template (so the pipeline never dead-ends).

### 8.2 Continuity Compiler — `services/compiler.ts` ⭐ the differentiator
**Pure TypeScript. Zero AI calls. Fully unit-testable.** Consumes `Beat[]` + character bibles + world entities + prior episodes' committed lore. Emits:

```ts
interface CompileReport {
  status: 'PASS'|'WARN'|'FAIL';
  estimatedCostUsd: number;
  violations: {
    rule: 'C1-CAST'|'C2-PRESENCE'|'C3-TIMELINE'|'C4-PROP'|'C5-WARDROBE'|'C6-LORE'|'C7-BUDGET'|'C8-DURATION';
    beatIndex: number; message: string; fixSuggestion: string; severity: 'ERROR'|'WARN';
  }[];
}
```
Rules (each is a small pure function; violations carry machine-actionable `fixSuggestion`):
- **C1-CAST:** every `castRefs` id exists and has a reference still (else plan is unrenderable → fix: "swap to character X" / "generate reference still first").
- **C2-PRESENCE:** a character cannot appear in two locations within overlapping time windows across consecutive beats (track per-character timeline intervals).
- **C3-TIMELINE:** per-location beat times must be non-decreasing; `timeOfDay` must match the location's day-window.
- **C4-PROP:** a prop must be `INTRODUCE`d before `USE`; `DROP`ped props can't be used until re-introduced; introduced props persist in inventory.
- **C5-WARDROBE:** outfit tag per character must equal the last worn tag for that location-day unless a change is explicitly costumed in a beat.
- **C6-LORE:** `loreAssertions` must not contradict structured bible `attrs` or previously committed lore of prior episodes (string-normalized key comparison; conflicts are ERROR, new facts are committed to lore store on PASS).
- **C7-BUDGET:** estimated render cost (durations × per-second rates × render mode) must fit the episode's render budget; otherwise downgrade directive (`VIDEO→STILL`) as WARN, hard FAIL only if stills don't fit either.
- **C8-DURATION:** `durationSec` within 4–20 and total episode within 90–240s.

**Repair loop (`services/repairer.ts`):** on FAIL, send violations + current plan to Writer (FAST tier) → returns revised plan → recompile. Max **3 loops** (persist `repairLoops`). If still FAIL after 3: episode marked `COMPILE_FAILED` with the report rendered in UI — **this is a feature, not a bug**: the dashboard visibly shows tokens saved = cost of rendering a broken script. Ship a fixture `fixtures/bad-beat.json` (violates C2-PRESENCE + C4-PROP) so this demo works without any LLM.

### 8.3 Render Crew — `services/renderer.ts`
For each compiled beat, in budget order: (1) generate still via IMAGE provider using `visualPrompt` + character bible descriptors + style suffix (cache by prompt hash); (2) if render mode `VIDEO` and provider supports it and budget allows: generate `durationSec` clip from the still (i2v); else Ken Burns metadata `{panX, panY, zoom}` computed deterministically from beat index (stored in payload); (3) if TTS enabled: synthesize each dialogue line (skip in degradation); (4) **consistency gate (VISION tier):** for REVEAL/TWIST beats only, send still to VLM with the character appearance descriptors → JSON `{consistent: boolean, issues: string[]}`; on inconsistency, one regeneration attempt, then accept with WARN badge. Every asset records `estCostUsd` on the Beat.

### 8.4 Audience Panel — `services/audience.ts` ⭐ the moat
**Persona generation (deterministic):** from `show.seed`, generate `panelSize` viewers from 12 archetype templates (Binge-Watcher, Casual Scroller, Genre Purist, Drama Queen, Cynic, Completist, Mood Viewer, Loss-Averse Fan, Theory-Crafter, Skimmer, Loyalist, Critic). Each `ViewerPersona`:

```ts
interface ViewerPersona {
  name: string; archetype: string; age: number; occupation: string;
  affinities: Record<BeatType, number>;   // 0..1, archetype-shaped + seeded jitter
  attentionSpanBeats: number;             // 3..12
  churnThreshold: number;                 // 0.25..0.6
  loyalty: number;                        // 0..1
  commentProbability: number;             // 0..1
  seed: number;
}
```

**Viewer memory (FSRS-inspired, Track-1 evidence):** on HOOK/REVEAL/TWIST/CLIFFHANGER beats, write/upsert `ViewerMemory` per viewer: `stability' = stability + (1 − stability) · impact(type)` (impact: CLIFFHANGER 0.9, TWIST 0.8, REVEAL 0.6, HOOK 0.4); retrievability at time of next episode: `R = exp(−Δdays / (0.9 · stability))` (simulate Δdays = episode gap, default 1). Returning-viewer bonus: if the previous CLIFFHANGER memory has `R > 0.5`, add `+0.10` satisfaction to episode's first HOOK beat and record `recalled:[keys]` in the screening events — **this makes memory measurably causal**, not decorative.

**Watch simulator (pure TS, seeded):** per viewer per beat:
```
novelty_i  = 1 − maxR(trope key for beat type)          // repeated tropes bore
recall_i   = 0.10 · (R of prior cliffhanger > 0.5 ? 1 : 0)
s_i        = clamp(0.15·quality + 0.45·affinity[type] + 0.25·novelty_i
                   + recall_i − fatigue(t) + ε, 0, 1)   // ε ~ N(0, 0.05) seeded
S_t        = 0.85·S_{t−1} + 0.15·s_i                   // S_0 = 0.35 + 0.3·loyalty
```
Viewer drops when `S_t < churnThreshold` for **2 consecutive beats** → `dropAtBeat`, `keepWatching=false`; else `keepWatching=true`. All events persisted to `Screening.events` as `[{beat, s, S, recalled}]`. `Math.random` is banned in this path; everything derives from `(show.seed, viewer.seed, epNumber, beat.index)`.

**Reactions:** for the subset where `rand < commentProbability` **and** cap allows (default: 60 comments/episode, degradation-scaled), FAST-tier LLM writes one in-voice comment referencing the specific beat + persona archetype; sentiment classified by the same call. These populate a live "audience wall" — and the top negative quotes are surfaced to the Writer in the treatment arm.

### 8.5 Analytics & Optimizer — `services/analytics.ts`, `services/optimizer.ts`
**Analytics (pure TS):** per-beat retention curve `retention(b) = stillWatching(b)/panel`; overall `retentionScore`; Kaplan–Meier survival step function; **beat cliffs table** (top drop-offs: beat, type, Δretention, top quote); segment breakdowns by archetype (top 3 / bottom 3); **cost-per-retained-viewer** `= episodeSpend / (panel × retentionScore)`.

**Optimizer (treatment arm):** after each episode, rank beat slots by cliff severity × low self-quality; Writer proposes 2 variants for the 1–2 worst slots; a 50-viewer subsample screens both variants (FAST, cheap: text-only micro-screening — no re-render); Thompson sampling with `Beta(1 + successes, 1 + failures)` picks the variant for next episode; persist `Experiment` with evidence `{n, rewardA, rewardB, alpha, beta}`. Decisions and their receipts are rendered in the UI.

**Dual-arm runner:** shows created with `mode='DUAL'` fork two series (same seed, premise, bible): Arm A = writer-only control (no analytics fed back, no experiments); Arm B = full loop. After the final episode compute the headline table: `retention ep1→ep3 delta per arm`, `cost-per-retained-viewer per arm`, `cliff count per arm`. This table is the money shot of the demo and the README.

## 9. PIPELINE STATE MACHINE — `lib/pipeline/runner.ts`

`DRAFT → WRITING → COMPILING → (COMPILE_FAILED ⟲ repair ≤3) → RENDERING → (RENDER_PARTIAL if degraded) → SCREENING → ANALYZING → DONE`
- One API call starts an episode; the runner executes steps sequentially **inside the request with step-level persistence** (each step writes its output + `JobLog` before advancing), and every step is idempotent (re-running a step replaces its output). The UI polls episode status (TanStack Query, 2s) and renders per-step progress with skeletons. A `POST /api/episodes/:id/advance` can resume a half-finished episode (crash-safe).
- For panel sizes > 400, `SCREENING` processes viewers in chunks of 100 per invocation to avoid event-loop starvation.

## 10. API SURFACE (all under `/api`, all validated with Zod, all metered)

| Method | Route | Purpose |
|---|---|---|
| POST | `/shows` | Create show (+ auto-generate characters/world from premise via BIG tier; returns show id) |
| GET | `/shows` / `/shows/:id` | List / full dashboard payload (show + episodes + latest metrics + budget state) |
| POST | `/shows/:id/panel` | Generate deterministic viewer panel |
| POST | `/shows/:id/episodes` | Start next episode for an arm (body: `{arm}`); runs the full state machine |
| GET | `/episodes/:id` | Episode + beats + compile report + job logs |
| POST | `/episodes/:id/compile` | Re-run compiler on current plan (returns report) |
| POST | `/episodes/:id/render` | (Re-)render pending beats |
| POST | `/episodes/:id/screen` | (Re-)run audience screening |
| GET | `/episodes/:id/metrics` | Retention curve, KM, cliffs, segments, cost-per-retained-viewer |
| GET | `/shows/:id/experiments` | All A/B experiments + chosen variants + evidence |
| GET | `/shows/:id/ledger` | Cost entries grouped by stage/episode + budget gauge data |
| POST | `/shows/:id/run-demo` | One click: runs all episodes × both arms end-to-end (bounded, for the demo) |
| GET | `/health` | Provider mode, DB OK, panel size, budget |

## 11. FRONTEND — `app/page.tsx` (single route, 5 tabs, warm studio palette)

- **Header:** show switcher (select), provider badge (SANDBOX/QWEN), budget gauge (progress), "Run Full Demo" button (calls `/run-demo`, streams progress via polling), theme toggle, sticky footer with build info.
- **Tab 1 · Studio:** premise editor; character cards (ref still, attrs, voice) with "generate reference still" action; world entity grid (locations/props); "Regenerate Panel" button with panel size slider (50–2000).
- **Tab 2 · Episodes:** arm toggle A/B; episode list with status badges; **pipeline stepper** (Writing → Compiling → Rendering → Screening → Analyzing) with live skeletons; **Compile Report card** (violations table: rule badge, beat, message, fixSuggestion; repair-loop counter; "tokens saved by gate" callout); storyboard strip (beat stills, type badges, durations, per-beat engagement once screened); player dialog (stills + Ken Burns animation timed by `durationSec`, subtitle track from dialogue); per-beat render badges.
- **Tab 3 · Audience:** persona gallery (archetype chips, affinity radar-lite as colored bars); **live reaction wall** (comments stream in with sentiment badges, grouped by beat); **memory inspector** (pick a viewer → list memories with retrievability bars `R`, stability, last-seen episode — the Track-1 proof surface); drop-off funnel per archetype.
- **Tab 4 · Analytics:** retention curve per episode (multi-line, Recharts); KM survival step chart; beat cliffs table (sortable); segment winners/losers; cost curve (spend vs retained-viewer cost per episode).
- **Tab 5 · Experiment:** dual-arm comparison cards (retention delta ep1→N per arm, big delta number with green/red); experiment timeline (slot, variants, chosen, evidence); the **headline verdict card** ("Treatment arm retained +X pts at Y% lower cost per retained viewer").
- **UX rules:** every async action has optimistic UI + sonner toasts; all lists `max-h-96 overflow-y-auto` with custom scrollbar; empty states with one-click "load demo show"; error states with retry; `aria-label` on all icon buttons; keyboard navigable tabs.

## 12. BUDGET GOVERNANCE (visible receipts)

Static price table (per model/kind) in `lib/ai/prices.ts`; metering on every call; `GET /shows/:id/ledger` powers the budget gauge + per-stage progress bars. Degradation ladder (auto, logged as JobLog WARN): 90% stage cap → video→stills; reaction sample 60→15; TTS off; panel subsample for experiments 50→20. The UI shows each degradation event as a badge — "budget-aware" must be *demonstrated*, not claimed.

## 13. MILESTONES (timeboxed, each with acceptance criteria)

- **M0 (1h) — Skeleton & rails:** scaffold tabs/blank pages, Prisma schema pushed, `lib/ai/provider.ts` + metering + `/health` green, seeded RNG util. *AC: `/health` returns sandbox mode; mock chat call writes a CostEntry.*
- **M1 (2h) — Show setup:** `POST /shows` generates bible (characters, locations, props) + ref stills; Studio tab functional. *AC: creating a show from a one-line premise yields ≥3 characters + 2 locations with images.*
- **M2 (2h) — Writer:** beat plan generation with Zod-retry-fallback; Episodes tab shows plan. *AC: 8–12 valid beats for the demo premise.*
- **M3 (3h) — Compiler + repairer:** all 8 rules + repair loop + bad-beat fixture. *AC: fixture FAILs with C2+C4 violations and zero AI calls; valid plan PASSes; repair loop resolves an injected violation within 3 loops.*
- **M4 (3h) — Renderer:** stills always; Ken Burns metadata; VLM consistency gate on REVEAL/TWIST; cost accounting. *AC: full episode renders stills for every beat with per-beat cost, within render budget.*
- **M5 (4h) — Audience:** persona generation, memory writer, watch simulator, reactions, metrics endpoint. *AC: 200 viewers produce identical curves across two identical runs (same seed); ≥1 cliffhanger memory with R>0.5 changes ep-2 HOOK satisfaction (test asserts the +0.10 path).*
- **M6 (3h) — Optimizer + dual arm:** experiments, Thompson choice, dual-arm runner, `/run-demo`. *AC: `run-demo` completes 3 episodes × 2 arms under budget with an Experiment table populated.*
- **M7 (2h) — Dashboard polish & demo:** charts, verdict card, toasts, skeletons, empty states, responsive pass, README. *AC: golden path (§14) passes in agent-browser; Lint clean.*

## 14. SELF-VERIFICATION PROTOCOL (mandatory before declaring done)

Run `agent-browser` against `/`:
1. Create demo show via UI → characters/world appear with stills.
2. Click **Run Full Demo** → stepper advances for ep1 A, ep1 B, ep2 A, ep2 B, ep3 A, ep3 B; no stuck states; toasts fire.
3. Compile Report shows the seeded bad-script rejection (fixture) with violations and "0 tokens spent" callout.
4. Analytics tab shows retention curves with real data for all 6 episodes; cliffs table non-empty.
5. Experiment tab shows the dual-arm verdict card with a signed delta.
6. Memory inspector shows decaying retrievability bars for a chosen viewer.
7. Budget gauge reflects ledger; degradation badges visible if any ladder step fired.
8. Cross-check `/home/z/my-project/dev.log` for runtime errors; `bun run lint` clean; test mobile width + sticky footer.

## 15. 3-MINUTE DEMO VIDEO SCRIPT (for the hackathon submission)

0:00–0:20 Hook: "Every AI showrunner can generate an episode. None of them know if anyone would watch." · 0:20–0:50 Create show from one line; bible + panel appear. · 0:50–1:30 The Gate: bad script fixture rejected, violations + fixes, "0 tokens"; valid script passes; repair loop counts down. · 1:30–2:10 The Audience: 200 personas screen ep1; retention curve draws live; comment wall; memory inspector decays. · 2:10–2:40 The Loop: cliffhanger recall bonus; optimizer picks variant via Thompson sampling; ep2 curve improves. · 2:40–3:00 The Verdict: dual-arm table, cost-per-retained-viewer, architecture diagram, "measure attention, not output."

## 16. README & SUBMISSION CHECKLIST (map to judging criteria)

- [ ] OSS license file at repo root (visible in About). [ ] Architecture diagram (this §5, rendered). [ ] Alibaba/Qwen deployment proof file (`deploy/README` + provider code path) or sandbox-mode explanation. [ ] 3-min video (script §15). [ ] Track declaration: **Track 2 (AI Showrunner)** — cross-track notes for Memory (§8.4) and Society. [ ] **Numbers section:** compile-gate tokens saved, retention deltas (arm B vs A), cost-per-retained-viewer, seeded reproducibility statement, panel size, budget spent. [ ] "What we learned" + blog post draft (Blog Post Prize eligibility).

## 17. STRETCH GOALS (only after M7)

Real video clips via Qwen video provider with side-by-side still/clip toggle · public "real human" panel mode where visitors rate beats next to the simulated panel (ground-truth check) · episode export (webm storyboard reel) · per-archetype editable personas · seasonal arc planner across 6+ episodes · socket.io live log console (port 3003).

## 18. ANTI-SCOPE (do NOT build)

No auth/multi-tenancy · no payments · no real MP4 encoding when video provider is absent (Ken Burns is the fallback by design) · no fine-tuning jobs · no external vector DB (SQLite JSON + structured lore is enough) · no WebSockets unless the optional log console is built · no additional routes beyond `/` · no Math.random in simulation paths · no indigo/blue theme · no test files.

## 19. DEFINITION OF DONE

1. Fresh `bun run dev` → `/` renders all 5 tabs, no console errors. 2. Golden path (§14) passes end-to-end in agent-browser with real data everywhere (no empty skeletons). 3. `run-demo` completes within the default budget with all metrics populated and reproducible across two runs (same seed → same curves). 4. `bun run lint` clean; dev.log free of runtime errors. 5. README contains the measured numbers from the last full run.

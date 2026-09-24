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

## Run it Don't kill it

```bash
bun run db:push   # sync schema
bun run dev       # http://localhost:3000
```

Then: **Create the demo show** (or New Show with any premise) → **Run Full Demo**.
DUAL mode runs Ep1A, Ep1B, Ep2A, Ep2B, Ep3A, Ep3B automatically.

## Power features

- **Keyboard-driven studio.** `1–6` switch tabs (Episodes · Arc · Studio · Audience · Analytics ·
  Experiment), `A`/`B` select arm, `E` runs the next episode, `Shift+D` launches the full dual-arm
  demo, `T` toggles theme, `?` opens the shortcut cheat-sheet.
- **Portable episode artifacts.** Every finished episode exports as a **Markdown script** (beat plan,
  full dialogue, compile report, per-beat engagement) or **JSON** payload —
  `GET /api/episodes/:id/export?format=md|json`, or the Export button on the Episodes tab.
- **Analytics export.** Retention curves download as CSV with one click for external analysis.
- **Beat retention heatmap.** Episodes × beats matrix; the paired premiere renders as two identical
  rows — visual proof of the paired design — while arm-B rows stay visibly warmer late in episodes.
- **Audience exploration.** Search/filter the 200 persona viewers by name or archetype, open any
  viewer's arm-scoped memory inspector (FSRS-style R bars + watch history), and read the
  sentiment-tinted reaction wall with drop-point attribution.
- **Human panel mode.** A real human can join the simulated panel: watch an episode in the player
  (rating stars appear when playback ends) or use "Rate it" on the Audience tab. Human reactions
  post to `POST /api/episodes/:id/reactions` (Zod-validated) and render pinned on the reaction wall
  with a gradient **human panel** badge and star rating — human-in-the-loop, visibly beside the sims.
- **Shareable deep links.** The dashboard syncs `?show=…&tab=…&ep=…` into the URL as you navigate;
  the header link button copies the exact view. Open a link and you land on that show, tab and
  episode — built for judge walkthroughs.
- **Present mode (read-only).** Append `?view=1` (or hit the header **Present** button) to turn the
  dashboard into a read-only screening room: Run/New Show/Gate-test/Re-compile/Regenerate controls
  disappear and mutating shortcuts are disabled — while **"Rate it" stays live**, so a judge can
  still join the human panel from the shared link.
- **Cohort retention explorer.** Per-archetype retention curves for any episode: keepers vs churners
  are pre-selected (top-2 + bottom-2), every archetype is toggleable, and a ranked keep-rate board
  shows each cohort's delta vs the panel average — "who churns, and where" in one glance.
- **Arm-by-episode receipt.** The Experiment tab adds a full A/B receipt table (retention, Δ pts
  color-scaled, spend, cost-per-retained-viewer trend) plus a verdict sparkline and Thompson
  reward-split bars — every number the optimizer saw, printable for judges.
- **Determinism receipt.** One click (or `GET /api/shows/:id/verify`) replays *every* screening from
  the master seed — pure code, no AI, no DB writes — and byte-compares each viewer's watch-event
  stream against what actually aired: 200 viewers × 6 episodes = 1,200 rows verified in ~100 ms.
  The receipt shows per-episode SHA-256 hashes, rows checked, replay time and a copyable show
  fingerprint. Ep1 (A) and Ep1 (B) display the *same hash* — the paired premiere, provable. If a
  re-compile ever drifts the curves, the receipt turns red and says so honestly.
- **Signed receipt artifact.** The determinism receipt downloads as a portable JSON artifact
  (`GET /api/shows/:id/verify?download=1`) with an HMAC-SHA256 attestation over its canonical form.
  The key is derived from the show's own seed, so anyone can recompute the signature — the artifact
  is self-verifying, not secret. Drop it in a repo, a paper, a pitch deck.
- **Season arc planner (Arc tab).** The writers-room view across episodes: a tension chart overlaying
  writer-intent beat tension (dashed steps) with measured panel engagement (solid, per arm); beat
  rhythm "DNA" strips comparing arm structures side by side; measured **cliffhanger → hook payoff**
  (share of viewers whose memory recalls the cliffhanger at the next episode's first beat); **open
  plot loops** decayed by the same FSRS model the audience uses (threads below 25% retrievability
  are shown struck-through — forgotten); and a **cast presence** matrix that exposes continuity gaps
  as holes. Zero new AI spend — recomputed from stored artifacts.
- **Calibrated, loyalty-coupled cliffhanger recall.** The returning-hook bonus threshold is matched to
  the FSRS time constant (an active-recall bar of 0.3 means "recalled exactly one episode later"), and
  the cliffhanger's memory **encoding strength scales with each viewer's loyalty** — recall becomes a
  graded, per-viewer event (the loyal third of the panel recalls; everyone else holds a fading trace),
  not an all-or-nothing panel flip. The season-arc view exposed both earlier failure modes (a 0.5 bar
  that was mathematically unreachable, then uniform recall); the shared write semantics live in one
  place (`memoryWrites`) used by the pipeline, the determinism replay and the arc board, so the three
  can never drift. Replay-verified byte-for-byte.
- **Writer's brief (Arc → Writer hand-off) — and the loop actually closes.** The Arc tab opens with a
  numbered, evidence-backed directive list for the next episode — rework the weakest measured beat,
  callback the most-at-risk still-alive thread before FSRS decay eats it, sharpen the cliffhanger
  hand-off (measured hook payoff), write for the churning cohort, watch the cost curve. Zero AI: a
  pure function of stored screenings, memories and plans, fingerprinted so the same data always
  yields the same brief — copy as markdown or download `brief-<show>-ep<N>-<arm>.md`
  (`GET /api/shows/:id/brief?arm=A|B`). **Write EpN from this brief** injects those directives into
  the real writer prompt (arm B — the control arm stays blind by design), snapshots the brief on the
  episode, and a **deterministic compliance receipt** then verifies each directive's machine
  contract against the finished plan: the callback title appears within the first N beats, beat 0
  re-states the cliffhanger, no first-half beat exceeds the churn-derived length cap, a first-half
  beat carries the detail density the weakest cohort needs, proven locations are reused. The writer
  is probabilistic; the compliance check is byte-honest and free. If the season order is exhausted,
  the card offers **Extend season & write EpN** (up to 6) so the loop keeps running.
- **Cohort lens.** The brief can be re-written through a specific archetype's eyes (top-2 keepers
  and bottom-2 churners offered as chips): the protect-beat is re-scored against that cohort's own
  churn curve and the directives carry that lens — the same measured season, a different writer's
  room (`GET /api/shows/:id/brief?arm=B&cohort=Skimmer`). Episodes written from a brief wear a
  `brief <fp8>` badge on the Episodes tab.
- **What-if brief simulator — a pre-flight check before render dollars move.** On the Arc tab below
  the brief: paste (or one-click load) a hypothetical EpN plan as JSON and the whole 200-viewer
  panel watches it in dry-run — the plan is validated against the writer's zod contract, checked
  against the current brief's machine contracts with the *same* deterministic verifier that grades
  real episodes, and simulated against every persona's arm-scoped FSRS memories. You get a grade
  (STRONG / PROMISING / MIXED / WEAK), the projected keep-rate delta in points vs the arm's last
  screened episode, a projected-vs-baseline retention curve, the exact beats where the panel bails,
  per-cohort movers (which archetype gained or lost vs baseline), per-directive compliance rows and
  a downloadable markdown report — all fingerprinted, reproducible, and **$0.000 spent**: no LLM,
  no writes, nothing queued. Iterate the outline in dry-run until the panel stays; only then hit
  render. (`POST /api/shows/:id/what-if`, `GET /api/shows/:id/what-if?arm=B` for the template.)
- **Writers-room brief bundle.** One click downloads every lens of the current brief — the
  whole-panel directive set plus one section per cohort lens — as a single markdown document with a
  lens/fingerprint table (`GET /api/shows/:id/brief-bundle?arm=A|B`). The writers' room reads the
  whole directive set side by side; every section carries its own deterministic fingerprint.
- **Memory-aware micro-screening.** The optimizer's 40-viewer variant tests are not panel averages:
  each sampled viewer scores the two candidate beats through `microScreenBeat` with their OWN
  arm-scoped FSRS memories (trope fatigue from what they actually remember), their real last
  smoothed satisfaction carried one beat forward, the loyalty-coupled returning-hook recall (only
  viewers whose memory clears the active-recall bar grant the +0.10), and common-random-number
  noise shared between both variants — a paired comparison. Thompson sampling keeps the reward on
  the mean-satisfaction scale (discriminative at n=40) while keep and hook-recall counts are
  persisted as per-experiment evidence (visible on the Experiment tab as `memory-aware` rows).
- **Pre-flight gate (optional governance).** A show-level switch on the what-if card arms the gate:
  arm-B episodes past the premiere are then refused with **428 PRECONDITION REQUIRED** unless a
  passing dry-run (STRONG or PROMISING) exists for that exact (arm, episode) — whole-panel brief,
  matching the CURRENT brief fingerprint, so a stale dry-run never opens the gate. Every dry-run is
  persisted as a receipt (`WhatIfRun`: grade, keep-rate, plan + brief fingerprints) and shown as the
  gate's audit log on the what-if card; the write response echoes the receipt that opened it. The
  control arm is never gated (it writes blind by experimental design), and the autonomous full-demo
  run bypasses the gate with an honest WARN in the job log.
- **Human-in-the-loop adoption ("Adopt & greenlight").** A passing dry-run is not just a receipt —
  it is a shootable plan. One click on the what-if card greenlights the episode FROM that exact
  dry-run (`POST /api/shows/:id/episodes` with `adoptRunId`): the simulated plan becomes the
  shooting script, the writer LLM is skipped entirely ($0 plan spend), the brief the plan was
  graded against is snapshotted for the compliance receipt, and the episode carries an
  `adopted <fp8>` badge through compile → render → screen. Because the dry-run and the screening
  run the same deterministic audience model, the projection IS the commitment: Ep6 (B) projected
  71.5% and screened at 71.5%. A rejected adoption answers with a precise **409** (grade, cohort
  lens, or stale brief fingerprint).
- **Governed demo (the refusal, live).** `POST /api/shows/:id/run-demo?gated=true` (header → Run
  Full Demo ▾ → **Governed demo**) enforces the gate in front of the judge: a gate-required
  episode without a receipt is **held** (`[BLOCK]`), the machine auto-runs a deterministic dry-run
  of the arm's last screened plan (`[DRYRUN]`, $0), then either admits it (`[PASS]`) or refuses
  the spend entirely (`[DENY]` — the episode is never created). Every decision lands in an
  append-only **governance receipts** card on the Studio tab (GATE/ADOPTION log, color-coded,
  newest first), next to the budget ledger.
- **Per-viewer journey timeline.** Select any viewer in the Memory inspector to see their episode-by-
  episode satisfaction trace S(t) as an SVG sparkline with their personal churn threshold (dashed
  amber), a drop marker where they bailed, amber pips where a memory was recalled, and their in-voice
  comment — the FSRS memory model made legible, one human story at a time.
- **Archetype color system.** All 12 archetypes carry consistent warm-palette identity dots across
  the persona gallery, journey timeline, memory inspector and keep-rate board — churners and
  keepers are trackable by color at a glance.
- **Stage-aware budget bar.** The header budget meter is segmented by pipeline stage
  (render/writer/audience/optimizer), so governance caps are visible at a glance.

## Experimental design (why the demo is trustworthy)

- **Paired premiere.** In DUAL mode, Episode 1 is generated once and *reused verbatim* in both
  arms, so both universes start from the identical episode. The ep1→ep3 retention delta therefore
  measures the optimizer loop — not LLM premiere luck.
- **Parallel-timeline memory.** Viewer memories are arm-scoped (`ViewerMemory.arm`): the same 200
  personas watch both timelines, each with its own memory continuity. The paired premiere screens
  against a pristine memory state in both arms.
- **Seeded determinism.** `Math.random` is banned in simulation paths; every viewer, screening,
  trope-fatigue factor and reaction derives from `mulberry32` chains rooted in `show.seed`.
  Re-screening the same episode replays byte-identical curves (verified).
- **Honest failure modes.** `COMPILE_FAILED` = the gate rejected the script (report rendered,
  tokens saved shown — a feature). `PIPELINE_ERROR` = infra crash (resumable from the last
  persisted artifact, never masquerading as a creative failure).

## Measured numbers (from the last full run)

Final verified run — "Neon Countdown" (seed 92067772, panel 200, 6 episodes × 2 arms, paired
premiere, budget $5.00, total spend $2.30):

| Metric | Arm A — control | Arm B — full loop |
|---|---|---|
| Ep1 (paired premiere) | 71.5% | 71.5% (identical by design) |
| Ep2 | 65.0% | **70.0%** |
| Ep3 | 65.0% | **69.5%** |
| Ep4 (first brief-fed episode) | 65.0% | 64.0% |
| Ep5 (written through the pre-flight gate; memory-aware optimizer era) | 65.0% | 64.5% |
| Ep6 (governance era — see below) | 65.0% | **71.5%** |
| Retention Δ EP1→EP6 | −6.5 pts | **0.0 pts** |
| **Lift (B − A)** | | **+6.5 pts** |

The run is reported exactly as measured, including the part most demos would hide: for five
episodes the treatment arm's retention advantage washed out to a coin flip (−0.5 pt at EP5), and
the dashboard said so instead of hiding it. Then the governance machinery paid for itself. Ep6 is
a clean comparison of two un-LLM'd plans — arm A's writer call was rate-limited, so its
deterministic fallback planner wrote blind (spend $0.0002), while arm B's episode was **held by
the armed pre-flight gate** until a what-if dry-run of an iterated plan graded PROMISING
(+7.0 pts projected, fp `ff182949…`), was **adopted** as the shooting script (writer skipped, $0
plan spend), and screened at **71.5% — exactly the projection**, because the dry-run and the
screening run the same deterministic audience model. The adopted plan recovered arm B to premiere
level and flipped the season verdict from −0.5 to **+6.5 pts**, with the whole decision chain
(BLOCK → dry-run receipt → adoption → compliance 3/3) visible in the job logs and the Studio
tab's governance receipts.

- Compile gate: fixture (`fixtures/bad-beat.json`) fails C2-PRESENCE + C4-PROP with 2 ERRORs and
  1 WARN — **$0.00 generation spend** (vs ~$0.72 estimated render cost saved); production plans
  auto-repair in bounded deterministic passes ($0) + ≤1 LLM repair.
- Panel: 200 viewers × 12 episodes (6 per arm); hook payoff at every hand-off is a graded ~35%
  (loyalty-coupled recall — the loyal third of the panel); same-seed re-screen replays
  byte-identical curves (verified).
- Stage ledger: RENDER $2.243 · WRITER $0.043 · OPTIMIZER $0.010 · AUDIENCE $0.005.
- Full receipts: **Experiment tab** / `GET /api/shows/:id/experiments` (per-arm deltas, lift,
  Thompson evidence with n=40 memory-aware micro-screening — keep and hook-recall counts per
  variant — viewer quotes).

![Analytics — retention curves](presentation/screenshots/analytics.png)
![Experiment — dual-arm verdict](presentation/screenshots/experiment.png)
![Audience — reaction wall + memory inspector](presentation/screenshots/audience.png)

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

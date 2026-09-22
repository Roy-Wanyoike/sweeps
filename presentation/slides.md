# SWEEPS — Pitch Deck (text version)

> Standalone HTML deck lives at `presentation/index.html` (13 slides, 16:9, arrow-key / click / swipe navigation, `F` = fullscreen, `#/4` = deep-link, print → one slide per page).
> Track 2 · AI Showrunner — Global AI Hackathon Series with Qwen Cloud · Team: **[YOUR TEAM]**

---

## 01 · Title — SWEEPS

**Losers generate content. Sweeps generates *measured attention per dollar*.**

- Scene 01 · Take 01 · **Track 2 — AI Showrunner**
- [YOUR TEAM] · Global AI Hackathon Series with Qwen Cloud
- Beats on every cut: HOOK → SETUP → REVEAL → TWIST → CLIFFHANGER — 200 persona-agents watching

---

## 02 · The problem

> **AI showrunners generate infinite scripts; none of them know if anyone would *watch*.**
> — the serialization problem · renewal is earned, not generated

- **∞ SCRIPTS** — generative writers ship infinite drafts. Output is the one thing AI already oversupplies.
- **0 RETENTION** — no writer agent measures whether a single viewer comes back for episode 2.
- **RENEWAL = RETENTION** — serialization economics: season 2 is granted beat-by-beat, at every drop-off cliff.

---

## 03 · The thesis / product

**An audience built in, not bolted on.**

An AI showrunner with a built-in simulated audience of **200 persona-agents** that **watch, remember (FSRS-style memory), churn, and comment** — every episode **A/B-measured** before it earns a *season 2*.

| FR | Beat | What happens |
|---|---|---|
| FR-01 | **Watch** | Every beat screened per viewer; satisfaction events logged to the screening record |
| FR-02 | **Remember** | FSRS-inspired memories decay between episodes; cliffhangers stick, filler fades |
| FR-03 | **Churn** | Two consecutive beats below a personal churn threshold and the viewer is gone |
| FR-04 | **Comment** | In-voice reactions quote the exact beat that lost them — and feed the writer |

---

## 04 · Architecture — one pipeline, two kinds of code

```
Writer Agent ──▶ ⚡CONTINUITY COMPILER ──▶ Render Crew ──▶ Audience Panel ──▶ Analytics ──▶ Optimizer
 (Qwen, LLM)      (pure TS · 0 tokens)     (stills+KB,     (200 seeded      (KM survival,  (Thompson,
                                           VLM gate)       personas)        cliffs)        Beta)
      ▲                                                                                │
      └──────────────── beat directive → episode N+1 ◀─────────────────────────────────┘
```

- **Deterministic rails** (amber): Continuity Compiler · Audience sim · Analytics · Optimizer — pure TS owns every auditable decision.
- **Probabilistic core** (dashed): Writer Agent (Qwen) · Render Crew (stills, Ken Burns, VLM consistency gate) — LLMs create inside the rails.
- Cross-cutting guarantees: Zod-validated LLM outputs · persist-before-advance (crash-safe resume) · metered per call with stage caps.

---

## 05 · The Gate — differentiator #1

**The Gate stops *unrenderable* scripts for free.**

**0** generation tokens spent on a rejected script — the Gate is pure TypeScript.

8 deterministic rules: `C1-CAST · C2-PRESENCE · C3-TIMELINE · C4-PROP · C5-WARDROBE · C6-LORE · C7-BUDGET · C8-DURATION`
Every violation ships a machine-actionable fix the Writer auto-applies — bounded to **≤ 3 repair loops**, then an honest `COMPILE_FAILED`.

**Mock compile report — `fixtures/bad-beat.json` → FAIL**

| | |
|---|---|
| `ERROR · C2-PRESENCE` (beats 3→4) | “mara” in DOCK_OFFICE (beat 3 · NIGHT) overlaps RIDGE_LINE (beat 4 · NIGHT). **FIX →** merge beats 3–4, or advance beat 4 to DUSK. |
| `ERROR · C4-PROP` (beat 6) | “brass_key” USE before INTRODUCE — dropped props can’t return unannounced. **FIX →** add INTRODUCE in beat 2 (desk drawer). |
| `WARN · C7-BUDGET` (beats 5 · 8) | VIDEO render exceeds the render stage cap by ~18%. **FIX →** downgrade VIDEO→STILL (Ken Burns metadata kept). |

**Tokens spent $0.00 · est. render saved ~$0.72 · repair loop 1/3**

---

## 06 · The Audience — differentiator #2 (Track 1 evidence)

**An audience that actually remembers.**

**12 archetypes** (seeded jitter per viewer): Binge-Watcher · Casual Scroller · Genre Purist · Drama Queen · Cynic · Completist · Mood Viewer · Loss-Averse Fan · Theory-Crafter · Skimmer · Loyalist · Critic
— affinity per beat type · attention span 3–12 beats · churn threshold 0.25–0.6 · loyalty + comment probability.

**Viewer memory (FSRS-inspired):**
- `stability′ = stability + (1 − stability) · impact`  — impact: CLIFFHANGER 0.9 · TWIST 0.8 · REVEAL 0.6 · HOOK 0.4
- `R = exp(−Δdays / (0.9 · stability))`
- Prior CLIFFHANGER with `R > 0.3` → **+0.10** satisfaction on the next episode’s HOOK
  (calibrated to the time constant: `R(Δ=1) ≈ 0.31` fires, `R(Δ=2) ≈ 0.11` doesn’t)
- **→ memory is causal, not decorative.**

**Watch simulator (seeded, per beat):**
- `S_t = 0.85·S_{t−1} + 0.15·s_i`
- `s_i = quality + affinity + novelty + recall − fatigue (+ seeded ε)`
- `S_t < churnThreshold` for **2 consecutive beats** → the viewer drops; `dropAtBeat` logged
- ε ~ N(0, 0.05) · Math.random banned in sim paths — every event derives from `(show.seed, viewer.seed, ep, beat)`

---

## 07 · The Loop — cliffs become directives

1. **Detect cliffs** — Analytics ranks the worst drop-off slots per episode
2. **Propose variants** — Writer drafts 2 rewrites for the worst 1–2 slots
3. **Micro-screen** — 40-viewer subsample, text-only — no re-render
4. **Thompson sample** — Beta posteriors pick the winner; ties break on evidence
5. **Inject directive** — chosen variant lands in the next episode’s writer prompt
6. **Close the loop** — the Writer’s Brief becomes the next episode’s prompt input, and a deterministic compliance receipt grades the writer against it

**Experiment receipt (mock) — #014 · EP2 · SLOT 7 — CLIFFHANGER → RESOLVED**

| | variant | posterior | reward | n |
|---|---|---|---|---|
| A | “cold open on the letter” | Beta(9, 12) | 0.41 | 20 |
| **B ✓ CHOSEN** | “open on the pursuit” | Beta(15, 7) | **0.68** | 20 |

evidence → **40-viewer memory-aware** micro-screen (each viewer scores through their own FSRS memories + last satisfaction) · Thompson draw over Beta posteriors · directive injected into the next episode

- Cheap by construction: text-only micro-screening = seconds of FAST-tier inference, not re-render dollars.
- Viewer-differentiated by design: keep counts and hook-recall counts ride along as persisted evidence (`memory-aware` rows on the Experiment tab).
- Auditable by default: n, rewards, posterior, keeps, recalls, directive — persisted to the Experiment table.

---

## 07b · The loop, closed and graded — Writer’s Brief → writer → compliance receipt

**The writer is probabilistic. The grading is deterministic.**

- The Arc tab distills the measured season into a fingerprinted **Writer’s Brief** — rework the worst measured beat, callback the thread FSRS decay is about to eat, sharpen the hook hand-off, write for the churning cohort, watch the cost curve. Zero AI to produce it.
- **“Write EpN from this brief”** injects those directives into the real writer prompt (arm B only — the control stays blind), then snapshots the brief onto the episode.
- When the episode lands, a **compliance receipt** verifies every directive’s machine contract against the finished plan: callback title present in the first beats ✓ · beat 0 re-states the cliffhanger ✓ · first-half beats under the churn-derived length cap ✓ · detail density for the weakest cohort ✓. Live run: **3/3 honored**.
- Misses are shown, not hidden — with an LLM writer the receipt becomes an honest quality gate, not decoration.
- **Cohort lens**: re-write the same brief through the Skimmer’s eyes — their own churn curve picks the protect-beat. Same season, different writer’s room.
- **Pre-flight gate (governance, optional)**: arm the gate and arm-B episodes are refused with 428 unless a passing dry-run (STRONG/PROMISING) exists for that exact episode against the *current* brief fingerprint. Every dry-run persists a receipt — the gate’s audit log is on the card. Ep5 (B) was written through the gate; the control arm is never gated.
- **Adopt & greenlight (human-in-the-loop)**: a passing dry-run is a shootable plan. One click adopts the exact simulated plan as the shooting script — writer LLM skipped, $0 plan spend, brief snapshotted for compliance. **Ep6 (B): projected 71.5% → screened 71.5%** — the projection IS the commitment, because the dry-run and the screening run the same deterministic audience model.
- **Governed demo (the refusal, live)**: `run-demo?gated=true` enforces the gate in front of the judge — `[BLOCK]` → auto dry-run ($0) → `[PASS]` admit or `[DENY]` refuse-the-spend — every decision receipted to the Studio tab’s **governance receipts** card.

---

## 08 · Dual-arm proof — one show, two fates

> **“The gate held the episode until the plan was right — then the projection landed exactly.”**
> `MEASURED — SEED 92067772 · PANEL 200`

- **Arm A — writer-only control** (never sees the audience) vs **Arm B — full loop** (cliffs + viewer quotes + Thompson-sampled variants + the Writer’s Brief fed back).
- Same seed · same show bible · same 200-viewer panel · 6 episodes per arm (season extended live).
- Measured KM survival: B led at EP2–EP3 (70.0% / 69.5% vs A 65.0%); EP4–EP5 washed out (64.0–64.5% vs 65.0%) — reported honestly. **EP6: the gate held arm B until an iterated plan graded PROMISING (+7.0 projected), the plan was adopted, and it screened at 71.5% — exactly the projection — while arm A (unguided fallback plan) landed at 65.0%.**

| Metric | Arm A | Arm B |
|---|---|---|
| Retention EP1→EP6 | −6.5 pts | **0.0 pts** (**lift +6.5 pts**) |
| EP6 (governance era) | 65.0% (unguided plan) | **71.5% (adopted, gate-cleared, writer skipped)** |
| Panel | 200 | 200 |

---

## 09 · The numbers that matter (cost ledger)

`SWEEPS · COST LEDGER — DEMO RUN` *(monospace, on purpose)*

| | Value |
|---|---|
| Compile-gate rejects — `fixtures/bad-beat.json` | **$0.00 spent · ~$0.72 saved** |
| Per-episode spend (stage-capped) | run total $2.30 of $5.00 — cheapest: Ep5 B $0.120 at 64.5% |
| Ep6 (B) plan spend | **$0.000 writer — adopted from a passing dry-run receipt** |
| Retention Δ EP1→EP6 | A −6.5 pts · B 0.0 pts · **lift +6.5 pts (governance era)** |
| Panel throughput | 200 personas × 12 episodes |
| Reproducibility | same seed → identical curves (receipt: 12/12 episodes, 2,400 rows byte-identical, ~136 ms) |

- **200** — panel size, persona-agents: 12 archetypes × seeded jitter, decaying memory + churn threshold each.
- **0×** — `Math.random` in sim paths: `mulberry32(show.seed, viewer.seed, ep, beat)` — same seed replays byte-identical curves.
- Live rows are computed from the database at run time — never hardcoded.

---

## 10 · Engineering honesty — receipts, not vibes

1. **Stage caps + degradation ladder** — WRITER 25% / RENDER 45% / AUDIENCE 20% / OTHER 10%; every AI call metered per-token/per-image. At **90% of any cap**: video → stills → reaction sampling → subsample shrink.
2. **Zod-validated outputs** — LLM → Zod ✓ → commit; Zod ✗ → retry ×1; still ✗ → deterministic fallback template. The pipeline never dead-ends on a bad generation.
3. **Crash-safe, resumable pipeline** — `WRITING → COMPILING ⟲≤3 → RENDERING → SCREENING → ANALYZING → DONE`; every step persists output + JobLog before advancing; resumes from the last good state.
4. **Honest statuses** — `COMPILE_FAILED` = creative failure (report rendered, tokens saved shown — a feature, not a bug) vs `PIPELINE_ERROR` = infra failure (retried, surfaced, never masquerading as creative).
5. **Signed determinism receipt** — same-seed replay byte-compares all 1,200 screening rows in ~100 ms (Ep1 A/B share one hash — paired premiere, provable); the receipt downloads as a portable JSON artifact with an HMAC-SHA256 attestation recomputable from the seed. Self-verifying, not secret.

---

## 11 · Stack & deployment — one codebase, two clouds

**Stack:** Next.js 16 App Router · TypeScript strict — single 6-tab dashboard (Episodes · **Arc** · Studio · Audience · Analytics · Experiment), 29 REST endpoints · Prisma + SQLite (12 models) · shadcn/ui + Tailwind 4 + Recharts · pure-TS seeded engines (mulberry32, FSRS memory, Kaplan–Meier, Thompson).

**Provider parity** — the only line that changes: `AI_PROVIDER=sandbox|qwen`

| Provider | Detail |
|---|---|
| SANDBOX | z-ai-web-dev-sdk — zero keys, runs anywhere (including the judge’s sandbox) |
| QWEN CLOUD | DashScope OpenAI-compatible endpoint — production parity |

Models: `qwen3.7-max` (WRITER) · `qwen-plus` (FAST) · `qwen-vl-plus` (VISION) · `wan` (VIDEO-READY)
→ identical Zod JSON contracts · identical metering · one env switch.

---

## 12 · Demo flow — three minutes, nine beats

| Time | Beat | What the judge sees |
|---|---|---|
| 0:00 | **HOOK** | “Every AI showrunner can generate an episode. None of them know if anyone would watch.” |
| 0:20 | **SETUP** | One-line premise → show bible, 12 archetypes and the 200-viewer panel materialize. |
| 0:50 | **REVEAL** | The Gate: bad fixture rejected — 2 ERRORs + 1 WARN, $0.00 spent; repair loop counts down live. |
| 1:20 | **TWIST** | 200 personas screen Ep1: retention curve draws, comment wall fills, memory inspector decays. |
| 1:45 | **ARC** | Season-arc board: writer tension vs measured engagement, open loops decaying, hook payoff graded — then the **writer’s brief** for the next episode. |
| 2:10 | **WHAT-IF** | The judge’s turn: paste any plan into the **what-if simulator** — 200 personas dry-run it in ~200 ms, grade drops, check the contracts — **$0.000 spent, nothing written**. Iterate until it grades PROMISING. |
| 2:35 | **PAYOFF** | **Adopt & greenlight** → the gate-eligible receipt becomes the shooting script: writer skipped, `$0` plan spend, `adopted <fp8>` badge rides the pipeline → **the episode screens at exactly the projected keep rate** (Ep6: projected 71.5% → screened 71.5%). Compliance receipt: **3/3 HONORED**. |
| 2:55 | **GOVERNED** | Run Full Demo ▾ → **Governed demo**: the gate refuses ungoverned spend live — `[BLOCK]` → auto dry-run ($0) → `[PASS]` admit or `[DENY]` refuse — every decision receipted to the Studio tab’s **governance receipts** card. |
| 3:10 | **CLIFFHANGER** | Dual-arm table lands: wash-out reported honestly at EP5, then the governance-era flip (**lift +6.5 pts**); determinism receipt re-verifies 12 episodes byte-for-byte; close on “measure attention, not output.” |

Single screen recording, one take — ends on the live dashboard, DUAL mode running.

---

## 13 · Closing

# Measure *attention*, not output.

**github.com/Roy-Wanyoike/sweeps** · <https://github.com/Roy-Wanyoike/sweeps>

- **TRACK 2 · AI SHOWRUNNER — PRIMARY**
- Cross-track 1 · MemoryAgent (FSRS viewer memory drives measurable satisfaction)
- Cross-track 3 · Agent Society (200 personas + writer + optimizer = a measured creative society)

[YOUR TEAM] — thank you. Judges: open the dashboard → Create Demo Show → Run Full Demo (DUAL).

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

**Experiment receipt (mock) — #014 · EP2 · SLOT 7 — CLIFFHANGER → RESOLVED**

| | variant | posterior | reward | n |
|---|---|---|---|---|
| A | “cold open on the letter” | Beta(9, 12) | 0.41 | 20 |
| **B ✓ CHOSEN** | “open on the pursuit” | Beta(15, 7) | **0.68** | 20 |

evidence → **40-viewer** micro-screen · Thompson draw over Beta posteriors · directive injected into **EP3 · beat 7**

- Cheap by construction: text-only micro-screening = seconds of FAST-tier inference, not re-render dollars.
- Auditable by default: n, rewards, posterior, directive — persisted to the Experiment table.

---

## 08 · Dual-arm proof — one show, two fates

> **“Treatment retained +4.5 pts at 6% lower cost per retained viewer.”**
> `MEASURED — SEED 92067772 · PANEL 200`

- **Arm A — writer-only control** (never sees the audience) vs **Arm B — full loop** (cliffs + viewer quotes + Thompson-sampled variants fed back).
- Same seed · same show bible · same 200-viewer panel · 6 episodes per arm.
- Measured KM survival: Arm B stays above Arm A at every post-premiere episode (B 69.5% vs A 65.0% at EP3).

| Metric | Arm A | Arm B |
|---|---|---|
| Retention EP1→EP3 | −6.5 pts | **−2.0 pts** |
| Cost / retained viewer | $0.0016 | **$0.0015** |
| Cliffs / episode (avg) | 7.0 | **5.7** (EP3: 8 vs **4**) |
| Panel | 200 | 200 |

---

## 09 · The numbers that matter (cost ledger)

`SWEEPS · COST LEDGER — DEMO RUN` *(monospace, on purpose)*

| | Value |
|---|---|
| Compile-gate rejects — `fixtures/bad-beat.json` | **$0.00 spent · ~$0.72 saved** |
| Per-episode spend (stage-capped) | A $0.227 · B $0.214 / episode — run total $1.35 of $5.00 |
| **Cost per retained viewer** | **Arm A $0.0016 · Arm B $0.0015** |
| Retention Δ EP1→EP3 | A −6.5 pts · B −2.0 pts · **lift +4.5 pts** |
| Panel throughput | 200 personas × 6 episodes |
| Reproducibility | same seed → identical curves |

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

**Stack:** Next.js 16 App Router · TypeScript strict — single 6-tab dashboard (Episodes · **Arc** · Studio · Audience · Analytics · Experiment), 23 REST endpoints · Prisma + SQLite (11 models) · shadcn/ui + Tailwind 4 + Recharts · pure-TS seeded engines (mulberry32, FSRS memory, Kaplan–Meier, Thompson).

**Provider parity** — the only line that changes: `AI_PROVIDER=sandbox|qwen`

| Provider | Detail |
|---|---|
| SANDBOX | z-ai-web-dev-sdk — zero keys, runs anywhere (including the judge’s sandbox) |
| QWEN CLOUD | DashScope OpenAI-compatible endpoint — production parity |

Models: `qwen3.7-max` (WRITER) · `qwen-plus` (FAST) · `qwen-vl-plus` (VISION) · `wan` (VIDEO-READY)
→ identical Zod JSON contracts · identical metering · one env switch.

---

## 12 · Demo flow — three minutes, six beats

| Time | Beat | What the judge sees |
|---|---|---|
| 0:00 | **HOOK** | “Every AI showrunner can generate an episode. None of them know if anyone would watch.” |
| 0:20 | **SETUP** | One-line premise → show bible, 12 archetypes and the 200-viewer panel materialize. |
| 0:50 | **REVEAL** | The Gate: bad fixture rejected — 2 ERRORs + 1 WARN, $0.00 spent; repair loop counts down live. |
| 1:30 | **TWIST** | 200 personas screen Ep1: retention curve draws, comment wall fills, memory inspector decays. |
| 2:10 | **ARC** | Season-arc board: writer tension vs measured engagement, open loops decaying below the recall bar, hook payoff measured (loyalty-coupled, graded) — then the **writer's brief** for the next episode and the determinism receipt, signed. |
| 2:40 | **CLIFFHANGER** | Thompson picks the variant; dual-arm table lands; close on “measure attention, not output.” |

Single screen recording, one take — ends on the live dashboard, DUAL mode running.

---

## 13 · Closing

# Measure *attention*, not output.

**github.com/Roy-Wanyoike/sweeps** · <https://github.com/Roy-Wanyoike/sweeps>

- **TRACK 2 · AI SHOWRUNNER — PRIMARY**
- Cross-track 1 · MemoryAgent (FSRS viewer memory drives measurable satisfaction)
- Cross-track 3 · Agent Society (200 personas + writer + optimizer = a measured creative society)

[YOUR TEAM] — thank you. Judges: open the dashboard → Create Demo Show → Run Full Demo (DUAL).

# Project Worklog

---
Task ID: 1
Agent: Z.ai Code (main)
Task: Review Qwen Cloud Hackathon submissions (729 projects, Devpost) and recommend ONE winning project for the next hackathon edition.

Work Log:
- Fetched hackathon overview: "Global AI Hackathon Series with Qwen Cloud" — $70K prizes, 5 tracks, 8458 participants, ended Jul 20.
- Extracted judging criteria: Technical Depth 30% / Innovation & Architecture 30% / Problem Value 25% / Presentation 15%.
- Scraped project gallery pages 1-5, 10, 20, 30 (~200 of 729 projects) via agent-browser; saved samples to /tmp/gallery_p*.txt.
- Fetched + parsed 6 winner pages (quen, rexgent, tarmac, lumen, dailies, janus) to extract winning patterns; saved to /tmp/winner_*.json.
- Built saturation map: Agent Society (~25%), Memory (~20%), Autopilot/SRE (~20%), Showrunner (~15%), Edge (~5%, least crowded).
- Formulated primary recommendation: "Sweeps" — retention-optimized AI showrunner with a simulated audience of Qwen agents (Track 2 + cross-track).

Stage Summary:
- Winner meta-pattern: deterministic "proof machinery" (stats, baselines, signed logs, calibration) wrapped around Qwen's probabilistic core, in a real pain domain.
- Recommendation spec, architecture, 48h build plan and demo script delivered in chat. Research artifacts cached in /tmp.
- Next step if user wants to build it: scaffold Next.js dashboard + agent pipeline per the build plan.

---
Task ID: 2
Agent: Z.ai Code (main)
Task: Produce the complete end-to-end build prompt for "Sweeps" (architecture, tech, scope, algorithms, milestones, verification).

Work Log:
- Authored /home/z/my-project/SWEEPS_MASTER_BUILD_PROMPT.md (~19 sections): role/mission, 5 measurable product claims, environment constraints, exact stack, architecture diagram, full Prisma schema (Show/Character/WorldEntity/Episode/Beat/Viewer/ViewerMemory/Screening/Experiment/CostEntry/JobLog), dual-provider AI layer (sandbox z-ai-web-dev-sdk <-> DashScope Qwen) with metering + degradation ladder, specs for Writer/Compiler(8 deterministic rules)/Renderer/Audience(FSRS memory + seeded watch sim)/Optimizer(Thompson + dual-arm), pipeline state machine, 13-route API surface, 5-tab dashboard spec, M0-M7 milestones with acceptance criteria, agent-browser verification protocol, 3-min demo script, submission checklist, anti-scope, definition of done.

Stage Summary:
- Master prompt saved at SWEEPS_MASTER_BUILD_PROMPT.md and delivered in chat.
- Ready to execute: next step is to implement M0-M7 per the prompt when user says go.

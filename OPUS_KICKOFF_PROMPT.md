# Kickoff prompt for Claude Opus

Copy-paste everything below the line into a fresh Claude Code session (Opus) in `R:\RLRChatAppOct2025`.

---

Read `ENHANCEMENT_PLAN_V3.5.md` at the repo root in full before doing anything else. It is the source document for this work: 1 priority bug fix (P0) plus 10 enhancements (E1–E10) for the RLR P2P Chat app, with per-item files, steps, constraints, and verification. Treat its "Codebase facts" and "Cross-cutting invariants" sections as hard requirements; where the plan says "verify first", actually verify in the code before implementing.

Then invoke `/goal` to turn that document into an execution brief before writing any code. Use these parameters when the goal skill interviews you — do not re-ask me things answered here:

- **Source doc:** `ENHANCEMENT_PLAN_V3.5.md` (repo root). The plan's per-item "Verify" sections are the acceptance tests.
- **Scope:** implement P0 and E1–E10 in the plan's suggested execution order (P0 → E1 → E4 → E8 → E9 → E3 → E5 → E6 → E2 → E10 → E7). One item at a time, fully verified before starting the next. No scope additions, no refactors beyond what an item needs, no dependency or Electron upgrades.
- **Environment & mode:** Windows 11, PowerShell, repo `R:\RLRChatAppOct2025`. Dev-run with `npm run dev`; two side-by-side instances via the `RLR_USER_DATA` env var (see `src/main/index.ts:6-12`) for peer testing. Build check: `npm run build`. Tests: `npm test`.
- **Autonomy boundaries:** you may edit code, run dev/build/tests, and create branches freely. You may NOT commit or push without my explicit approval, may NOT bump `package.json` version or add the changelog entry until I say "cut the release", and may NOT touch `src/main/network/secure-channel.ts`, the handshake, or packaging/publish config (`electron-builder.yml`).
- **Per-item checklist (every one of the 11 items):** (1) read the item's plan section AND the referenced code; (2) confirm/adjust the plan's assumptions against reality — if the code contradicts the plan, say so and propose the correction before implementing; (3) implement; (4) `npm run build` clean + `npm test` green; (5) run the item's manual "Verify" steps in the live app and report what you observed (not "should work" — what happened); (6) unit tests for any new pure util; (7) report the item done with a diff summary, then move to the next.
- **Definition of done (falsifiable):** all 11 items implemented; `npm run build` exits 0 with no TS errors; `npm test` fully green including the new tests; every per-item Verify step demonstrated in a running app (P0 specifically: window dragged in all directions on dark + light theme with header icons never disappearing); protocol compatibility for E7 demonstrated by the plan's simulated-old-client test; no regressions in: send/receive text between two instances, TTS read-aloud in "Talk to me", file/photo send, reconnect after killing one instance.
- **Known bugs going in:** the P0 drag-repaint bug (diagnose per the plan's ordered candidate list — confirm the cause in DevTools before choosing a fix); project `CLAUDE.md` is stale (says two users; there are three identities and a hub relay — trust the plan and the code, not CLAUDE.md, where they conflict).
- **Cross-cutting invariants:** the plan's "Cross-cutting invariants" section, verbatim — especially Electron 21/Win 8.1 compatibility, 3.4.x protocol backward-compatibility, and MessageBubble memoization (every new prop referentially stable).
- **Exit state / proof artifact:** a working tree (uncommitted, or on a feature branch if I approve commits along the way) containing all 11 items, plus a final report `V3.5_COMPLETION_REPORT.md` listing, per item: what changed (files), how it was verified (exact observations), and any deviations from the plan with reasons.

After `/goal` hands back the brief, show it to me for approval before implementing anything.

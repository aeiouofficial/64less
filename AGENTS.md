# 64less agent instructions

Read this file before changing the repository. Then read `docs/CURRENT_HANDOFF.md` and the document relevant to the task.

## Mission

64less runs Windows-oriented Node/web workspaces on Linux by adapting explicit workspace assumptions. It is not a Windows emulator and must not pretend to provide Windows kernel, driver, registry, COM, service, or D3D12/WebGPU equivalence.

The product also provides a local headed QA cockpit for automated development agents: real Chromium, persistent diagnostics, physical X11 input, screenshots, and crash-resilient recording.

## Non-negotiable invariants

- Never spoof `process.platform`, `process.arch`, package-manager platform selection, or native-module ABI.
- Prefer native Linux execution. Translate only Windows conventions with narrow, tested semantics.
- Refuse ambiguous translation. A visible `Unsupported` result is better than a plausible broken command.
- Keep workspace-specific behavior in configuration/profiles, not core modules.
- Do not add hidden downloads, remote hosting, outbound telemetry, or network bootstrap. Local session diagnostics/evidence are allowed and must stay local by default.
- Physical QA means OS-level input. CDP may locate/observe elements, but it must not replace the physical click/key path.
- Preserve session evidence on failures. Never overwrite earlier evidence during recovery/restart.
- Keep modules small and boring. Comment intent only when the reason is not obvious from the code.
- Do not copy third-party implementation code without provenance, license review, and an explicit reason.

## Required change loop

1. Establish the baseline: `node bin/64less.js --version` and `npm run verify`.
2. Inspect the relevant module and nearby tests before editing.
3. Make the smallest coherent change at the correct architectural layer.
4. Add a positive test and a nearby refusal/failure test for compatibility rules.
5. Run `npm run verify`.
6. If QA/runtime code changed, rebuild `runtime/bin/64less-input` and run the headed fixture acceptance path.
7. Update `CHANGELOG.md`, `docs/CURRENT_HANDOFF.md`, and any affected design/usage docs.
8. Build the source and portable artifacts only from a verified tree; integrity-test and hash them.

Do not mark work accepted because source code looks correct. Acceptance requires the observable gate documented in `docs/WORK_PLAN.md`.

## Repository map

- `src/workspace/` — factual workspace inspection only.
- `src/adapters/` — deterministic compatibility translations and refusal logic.
- `src/dependencies/` — dependency/lockfile inspection and offline normalization planning.
- `src/runtime/` — native process environment and workspace process ownership.
- `src/qa/` — display, Chromium/CDP, input, cockpit, recording, QA policy.
- `src/session/` — session lifecycle, ledgers, recovery, summaries.
- `src/commands/` — CLI command orchestration; keep business logic below this layer.
- `test/` — fast deterministic behavioral tests.
- `docs/` — design, maintenance, handoff, and release protocol.

## Where to continue

`docs/CURRENT_HANDOFF.md` is the authoritative continuation note shipped with each release. Treat the verified repository and its checked-in project status as the baseline. When integrating a newer source tree, establish provenance and compare it explicitly before merging.

# Changelog

## 0.3.0 — 2026-08-04

Portability and long-run QA release.

### Offline dependency cache

- Added explicit libc-aware lock/package selection without package-name inference.
- Added content-addressed, hash-verified offline cache export/import manifests.
- Cache loading verifies path confinement, SHA-256, package identity, platform metadata, and install-script metadata against each archive.

### Capability executors

- Added the first explicit executor contract: `powershell-core` for narrow file-scoped PowerShell scripts.
- `plan` reports `Executor required` separately from `Unsupported`.
- PowerShell Core is disabled by default and must be both enabled in config and available on the host.
- Inline/encoded PowerShell remains unsupported; 64less does not translate PowerShell source to Bash.

### Long-run QA telemetry

- Added local `resources.ndjson` evidence with host memory/load and workspace/Chromium process-group RSS/CPU snapshots.
- Added selected CDP Performance metrics and sampled requestAnimationFrame FPS.
- `summary` now reports resource peaks/growth and FPS statistics.
- Telemetry remains local session evidence; no outbound telemetry or remote service was added.

### Validation

- 65 JavaScript files pass syntax checks and 38 behavioral tests pass.
- Headed QA passed physical input, screenshot, deliberate Chromium crash/restart, replacement-browser telemetry, MKV/MP4 recording, and clean teardown.
- CDP Performance metrics and local rAF FPS are captured after browser readiness and continue after restart.
- Representative local native npm archives passed portable cache export/import with SHA-256 and metadata revalidation.
- Selector-to-physical-click coordinate conversion now uses CDP outer-window bounds, avoiding X11 window-manager `screenY` offsets and DevTools-docking width distortion; the fix was physically revalidated before release.

## 0.2.0 — 2026-08-04

Hardening release focused on truthful command adaptation, offline dependency diagnosis/repair, and crash-safe agent continuation.

### Agent continuity

- Added canonical `AGENTS.md` plus quickstart, extension, self-update, release/handoff, and current-state documents.
- Added tests that keep the release tree self-describing for stateless coding agents.

### Command adaptation

- Replaced top-level `&&`/`||` regex assumptions with a quote-aware command-chain parser.
- Fixed Windows `set VAR=value` semantics to emit exported environment values for child processes.
- Added conservative translations for simple `where`, `copy`, `move`, and `del` forms.
- Added explicit refusal for malformed quoting, batch `%~dp0`, caret escapes, services, registry behavior, opaque PowerShell, and unsupported batch control flow.
- Added an npm script-shell adapter so real npm lifecycle script bodies are adapted without editing `package.json` or bypassing npm lifecycle behavior.
- `plan` now recursively inspects reachable npm lifecycle/nested `npm run` scripts and resolves exact explicit `npm run <script>` commands back to the package-script model.

### Dependencies

- Added `64less deps` for npm lockfile OS/CPU compatibility inspection.
- Separates wrong-platform packages merely present in the lockfile from wrong-platform packages actually installed and host-platform packages actually missing.
- Added local `.tgz` cache indexing with exact name/version, SHA-256, OS/CPU/libc metadata, and install-script detection.
- Added explicit `--repair` mode that atomically extracts only exact host-compatible missing packages with no install lifecycle scripts.
- Offline repair records provenance and hashes and does not modify `package.json`, `package-lock.json`, or automatically remove incompatible installed packages.

### Session reliability

- Live QA markers now bind PID to Linux process birth identity before physical input is allowed.
- Added `sessions`, `summary`, and stale `recover` commands.
- Session manifests are finalized with end state, workspace exit, browser restart count, and error state.
- Added one-time configurable Chromium restart after unexpected browser exit while preserving the same evidence directory.
- Selector-targeted input now waits for a process-identity-validated, CDP-ready replacement browser after restart, closing an immediate post-crash race that could otherwise lose input evidence.
- Crash recovery terminates only recorded owned processes whose PID and birth identity still match, restores the temporary Chromium policy, and remuxes surviving MKV evidence when possible.

### Validation

- 56 JavaScript files pass syntax checks and 27 behavioral tests pass.
- Adapted npm pre/dev/post lifecycle execution was exercised end-to-end without modifying the fixture manifest.
- Headed QA passed physical selector-targeted click, screenshot capture, deliberate Chromium `SIGKILL`, automatic browser restart, second physical click, MKV/MP4 evidence, and clean shutdown.
- Forced controller `SIGKILL` was recovered from the stale marker; owned processes were cleaned, policy state restored, and the surviving MKV was remuxed.
- Representative Windows-oriented npm fixtures verify recursive lifecycle/script planning without project-specific translation rules.
- Cross-platform dependency fixtures verify that wrong-platform installed packages are distinguished from harmless optional lockfile entries and that exact host-compatible `.tgz` packages can be repaired without modifying project manifests.

## 0.1.0 — 2026-08-04

Initial engineering baseline.

### Core

- Added dependency-free ESM CLI.
- Added workspace inspection and Windows-orientation diagnostics.
- Added conservative Windows shell/path translation with explicit refusal boundaries.
- Added native Linux runtime environment mapping without platform spoofing.
- Added deterministic session manifests and process-tree cleanup.

### Headed QA

- Added private Xvfb/Openbox sessions.
- Added headed Chromium with docked DevTools and localhost CDP capture.
- Added scoped managed-policy repair for isolated Chromium environments that block localhost.
- Added non-root Chromium launch when the 64less controller runs as root, retaining Chromium sandboxing.
- Added readable live browser console/error log alongside full CDP NDJSON evidence.
- Added visible workspace/browser log cockpit.
- Added XTest physical mouse/keyboard helper, click marker, input ledger, and selector-to-physical-click command.
- Added screenshots, 30 FPS MKV recording, and MP4 remux.

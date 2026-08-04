# 64less

**Run Windows-first web workspaces natively on Linux. No Windows image required.**

64less adapts the *workspace assumptions* that make otherwise portable Node/web projects feel Windows-only: shell syntax, Windows paths, launcher conventions, environment names, local browser startup, and QA tooling. It does not emulate a Windows kernel and it does not claim that Linux Chromium is equivalent to Windows D3D12/WebGPU.

## Why

A large class of "Windows workspaces" are actually portable web applications surrounded by Windows-specific glue. Running an entire Windows VM to execute that glue is expensive and makes local agent QA awkward. Running everything through Wine can introduce a different set of browser and native-module problems.

64less takes a narrower approach:

1. inspect the workspace;
2. identify explicit Windows assumptions;
3. translate only rules with known semantics;
4. keep Node and native dependencies on the real Linux platform;
5. run the local app normally;
6. provide a headed Chromium QA session with persistent diagnostics and recording.

Unknown Windows-only behavior is reported instead of guessed.

For physical QA, `64less click` uses CDP only to resolve an element's on-screen position; the click itself is emitted through X11/XTest and is recorded in the input ledger.

## Current commands

```bash
64less inspect ./workspace
64less doctor ./workspace
64less deps ./workspace
64less plan ./workspace --script dev
64less run ./workspace --script dev
64less qa ./workspace --script dev
64less click ./workspace 'button[data-action=play]'
64less sessions ./workspace
64less summary ./workspace
64less recover ./workspace
```

For an offline dependency payload:

```bash
64less deps ./workspace --cache ./offline-tgz
64less deps ./workspace --cache ./offline-tgz --repair
64less deps ./workspace --cache ./offline-tgz --export-cache ./portable-cache
64less deps ./workspace --import-cache ./portable-cache --repair
```

`64less qa` creates `.64less/sessions/<timestamp>/` containing the command manifest, workspace output, Chromium stderr, a readable browser event log, full CDP console/network/page events, an input ledger, local resource/FPS telemetry, screenshots on request, optional Chromium netlog, an MKV recording, and an MP4 remux when FFmpeg can complete it.

## Design boundary

64less is for Windows-*oriented* web workspaces, not arbitrary Windows desktop applications. A project that requires Win32 kernel services, registry behavior, COM, a Windows graphics driver, or native Windows-only executable semantics is outside the core runtime. Optional compatibility plugins can handle selected cases later, but the core will keep a strict boundary.

See `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/COMPATIBILITY_MODEL.md`, `docs/DEPENDENCY_NORMALIZATION.md`, `docs/OFFLINE_CACHE.md`, `docs/EXECUTORS.md`, `docs/TELEMETRY.md`, `docs/WORK_PLAN.md`, and `docs/ROADMAP.md`.


## Portable offline bundle

The source tree can stage a local offline controller bundle with its own Node/npm runtime:

```bash
./scripts/build-native.sh
./scripts/build-portable.sh ./dist/64less-portable
./dist/64less-portable/bin/64less-portable.sh doctor ./workspace
```

The bundle does not download Chromium or OS graphics tools. `doctor` discovers those capabilities from the isolated Linux environment and reports what is missing.

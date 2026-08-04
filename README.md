# 64less
64less runs Windows-oriented Node/web workspaces on Linux by adapting explicit workspace assumptions instead of emulating Windows.  This release focuses on portable offline dependency handling, explicit executor boundaries, long-run headed browser QA, crash continuity, and physically verifiable input.

Highlights

Conservative Windows workspace adaptation — supports a tested subset of shell, path, environment, npm lifecycle, and launcher conventions without spoofing process.platform or native-module ABI.

Portable offline package caches — deterministic manifests, content-addressed archives, SHA-256 validation, path confinement, package identity checks, and explicit OS/CPU/libc matching.

Capability-scoped executors — introduces an opt-in powershell-core executor for narrow file-scoped PowerShell use; opaque/inline PowerShell remains unsupported.

Headed Chromium QA — private X11 display support, Chromium/CDP diagnostics, readable browser logs, screenshots, crash-resistant MKV recording, and MP4 remux.

Physical input evidence — selectors may be resolved through CDP, but mouse/keyboard actions are emitted through X11/XTest and recorded in the session ledger.

Crash continuity — Chromium can restart inside the same evidence session while logs, recordings, telemetry, and prior events remain preserved.

Local performance telemetry — process-group memory/CPU, selected CDP Performance metrics, and sampled requestAnimationFrame FPS are written locally to session evidence.

Offline-first runtime behavior — 64less does not download packages, browsers, or runtime tools during startup.

Compatibility boundary

64less targets Windows-oriented web workspaces, not arbitrary Windows desktop software. Windows-only kernel APIs, registry/COM/services, native Windows graphics-driver behavior, and opaque platform-specific executables are outside the core runtime unless a future explicit executor supports a narrow use case.

64less reports unsupported behavior rather than silently approximating it.

Requirements

Core CLI:

Linux

Node.js 20.11+

Headed QA features additionally discover:

Chromium/Chrome-compatible browser

FFmpeg

Xvfb or an existing X11 display

Openbox

xterm

wmctrl

X11/XTest libraries for the native input helper

The portable Linux x64 asset bundles Node/npm and the 64less XTest helper. System browser/graphics/capture tools remain host capabilities and are reported by 64less doctor if missing.

Quick start

64less inspect ./workspace
64less doctor ./workspace
64less plan ./workspace --script dev
64less run ./workspace --script dev

Headed QA:

64less qa ./workspace --script dev
64less click ./workspace 'button[data-action="play"]'
64less summary ./workspace

Offline package cache:

64less deps ./workspace --cache ./offline-tgz
64less deps ./workspace --cache ./offline-tgz --export-cache ./portable-cache
64less deps ./workspace --import-cache ./portable-cache --repair

Verification

The public v0.3.0 tree passes:

65 JavaScript syntax checks

38 behavioral tests

native XTest helper build

portable bundled-runtime --version and doctor checks

See docs/VALIDATION.md and CHANGELOG.md for the checked-in validation contract and release history.

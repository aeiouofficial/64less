# AsmJit Readiness Plan — 64less

Status: PREPARED_ONLY
Branch: `prep/asmjit-readiness-2026-09-19`
Decision: CONDITIONAL / NO CURRENT INTEGRATION

64less currently adapts Windows-oriented Node/web workspaces on Linux; it is not a CPU emulator or binary translator.

## Revisit trigger
Only reopen AsmJit work if the product scope expands to executing/translating native x86/x64 Windows code through a dedicated native runtime.

## If activated
Define execution boundary -> decoder/IR requirements -> native static baseline -> isolated JIT prototype -> cache/invalidation/security model -> cross-architecture tests.

Do not add AsmJit for ordinary Node, browser, process-launch, filesystem, or compatibility-shim work.

No implementation, dependency addition, PR, or merge on this branch.

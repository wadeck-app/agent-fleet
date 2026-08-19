# Policy Engine — Spec Index

> Extracted from `.claude/specs/2026-07-30-flow-cli/` on 2026-08-19.

## What is the policy engine?

The policy engine is a named step type (alongside `model`, `script`, `subflow`) that can programmatically inspect and modify the running flow graph. A policy step does not call Claude to produce output — it enforces rules by:

1. **Inspecting** the current step graph for missing or required patterns (e.g. "is a security-scan step present?").
2. **Injecting** missing steps via the `provideSteps` MCP tool when a required pattern is absent.
3. **Blocking execution** (by not completing, or by failing) when a required condition is not met before the flow can proceed.

Example use cases (from D36):
- "No security scan detected → inject one."
- "Validate that a required feedback loop exists before allowing execution to proceed."
- A security scan injected by a model step may itself inject a remediation step (recursive injection, bounded by `maxChildDepth`).

## How it works

The mechanism is the same for all step types that inject: the flow MCP server (per-execution, started at `assign` time — D35) exposes a `provideSteps` tool. Any step type (model, script, or a future `policy` type) calls `provideSteps` to inject steps into the running graph. Injected steps may carry a `parent` field to become sub-steps of the injecting step (D36).

The policy engine is **not a separate runtime** — it is a usage pattern built on:
- The `provideSteps` MCP tool (D35, D36, D39)
- The `parent` field semantics (D36)
- The recursive sub-step hierarchy with `maxChildDepth` depth limit (D36)

## Scope

In scope for this spec:
- The `provideSteps` tool interface and validation rules (D39)
- The `parent`/child step hierarchy enabling policy-controlled sub-step injection (D36)
- The MCP server infrastructure that exposes `provideSteps` (D35)
- Open design questions about the policy step type itself

Out of scope:
- The broader flow CLI architecture (daemon, workers, log streaming — see `.claude/specs/2026-07-30-flow-cli/`)
- CLI distribution (see `.claude/specs/2026-08-18_21-01_cli-distribution/`)

## Documents

- [decisions.md](decisions.md) — Architecture decisions relevant to the policy engine
- [abstractions.md](abstractions.md) — Data structures and interfaces
- [open-questions.md](open-questions.md) — Open design questions

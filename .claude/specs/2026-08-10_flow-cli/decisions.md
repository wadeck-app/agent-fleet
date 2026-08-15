## D40 — Worker env: allowlist (deviation from D31)

**D31 original:** Worker subprocess env is empty by default; scripts that call system binaries must declare PATH explicitly in the flow YAML.

**Actual implementation:** Worker receives a curated allowlist — PATH, HOME, ANTHROPIC_API_KEY, TEMP/TMP, and Windows-specific SystemRoot/USERPROFILE. Flow-declared step `env:` is merged on top with highest priority.

**Rationale:** D31's empty-by-default would silently break all script steps on first use (no PATH = no shell tools). The security goal (prevent credential exfiltration) is achieved by the allowlist — only named vars pass, daemon's broader env is blocked. The usability tradeoff favors not requiring every flow author to declare PATH explicitly.

**Security note:** ANTHROPIC_API_KEY is forwarded explicitly by name (conscious decision, visible in code) because model steps require it. All other credentials are blocked. See security-analysis-2026-08-15.md.

**Date:** 2026-08-15

## D41 — Build system: esbuild + Go launcher (integration of both approaches)

**Context:** `origin/integration` used tsx for development (no build step) + Go launcher for production distribution. `origin/laptop-cli` used esbuild. The unified implementation combines both.

**Decision:** esbuild produces three bundles:

- `dist/flow.cjs` — CJS bundle, entry point for the Go launcher binary
- `dist/cli/TaskIndex.js` — ESM bundle, for direct node invocation of `task` CLI
- `dist/worker/Worker.js` — ESM bundle, spawned by WorkerPool

The Go launcher (`@wadeck/singleton-daemon-kit/go-launcher`) wraps `node flow.cjs` to provide a proper named binary (`flow.exe` on Windows). Build with `npm run build-launcher`.

The tsx dev launcher (`bin/flow.js`) from integration is **not carried over** — developers use `npm run dev` (tsx direct) or `node dist/flow.cjs` after `npm run build`.

**Date:** 2026-08-15

## D42 — flow validate: 4 exit codes (extension of D34)

**D34 original:** Exit 0 (valid) / 1 (invalid JSON, deprecated) / 2 (file not found).

**Actual implementation:** Exit 0 (valid) / 1 (validation errors) / 2 (file not found or unreadable) / 3 (YAML parse error).

**Rationale:** A YAML parse error is semantically distinct from a validation error (the file cannot be parsed at all vs the parsed content is invalid). Callers need to differentiate to provide appropriate user guidance. Exit code 3 is an intentional extension documented here.

**Date:** 2026-08-15

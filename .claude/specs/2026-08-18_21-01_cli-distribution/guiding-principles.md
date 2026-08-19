# Guiding Principles -- CLI Distribution

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: Node.js is a system dependency, never embedded
Binaries must stay under 5 MB. Node.js is a well-known prerequisite (same model as Claude CLI, npm, etc.).
**Why:** Embedding a Node.js runtime (pkg/bun/deno compile) inflates each binary to 80-120 MB, makes security updates harder (CVE in embedded runtime requires a new release), and adds cross-compilation complexity.

### P-2: One Go launcher binary per CLI, one esbuild bundle per CLI
Each CLI (flow, task) produces exactly two artifacts: a lightweight Go launcher (.exe / darwin binary) and a bundled .cjs file. The launcher locates node on PATH and runs the bundle.
**Why:** The Go launcher infrastructure already exists in @wadeck/singleton-daemon-kit. wdrive uses the same pattern successfully. Avoids reinventing distribution mechanics.

### P-3: Reuse @wadeck/singleton-daemon-kit
All Go launcher compilation, daemon management, and any shared distribution infrastructure comes from the SDK. Do not fork or duplicate SDK code into agent-fleet.
**Why:** Maintenance burden stays in one place. The SDK is already versioned and published to the private GitLab npm registry. Both wdrive and agent-fleet already depend on it.

### P-4: User-local install by default -- no root/admin required
Default install target is ~/.local/bin (Linux/macOS) or %USERPROFILE%\.local\bin (Windows). Never require elevated privileges unless the user explicitly opts in.
**Why:** Developer tools installed system-wide create friction in team environments. User-local is safer (T-02 in threat model) and easier to uninstall.

### P-5: Easy update path (mechanism TBD)
Users should be able to update flow/task without manually re-running an install script. The exact mechanism depends on the distribution channel decision.
**Why:** Agents using flow/task need a reliable way to stay on a known version. Mechanism will be decided in open question #4 after the distribution channel is resolved.

### P-6: Reproducible, signed releases
Every release artifact must be signed (Ed25519) and verified on install. The signing key lives only in CI secrets.
**Why:** A tampered CLI binary has full user-level code execution capabilities. Signature verification is the only reliable mitigation (T-01 in threat model).

### P-7: No source checkout required to use the CLIs
`npm install -g @wadeck/flow-cli` is the entire install. Zero files from agent-fleet repo required.
**Why:** This is the core requirement. The current npm-link-from-source model requires cloning agent-fleet first, which is the only friction the user wants to eliminate.

### P-9: Incremental migration -- validate before propagating
Ship the new distribution pipeline to flow-cli + task-cli first. Only after it is proven in production do violations-cli and wdrive migrate to the same pattern.
**Why:** wdrive is the most complex (daemon lifecycle, tray binary, updater). Breaking its current working distribution while the new pattern is unproven creates unnecessary risk. The migration order is: flow+task -> violations-cli -> wdrive.

### P-8: Separate edge and stable channels
Push-to-main produces an edge release. Manual git tag produces a stable release. Users can pin to a channel.
**Why:** Agents and CI workflows need a stable channel to avoid unexpected breakage. Developers need an edge channel for testing. wdrive uses the same dual-channel pattern.

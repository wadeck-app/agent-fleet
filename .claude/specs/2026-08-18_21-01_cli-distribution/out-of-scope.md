# Out of Scope -- CLI Distribution

Items listed here are **explicitly excluded**.
Raising an excluded item as a requirement is a change-of-scope conversation, not a design question.

## Excluded items

### GitHub Releases as distribution channel

**Reason:** Replaced by npm GitLab registry. GitHub Releases require a per-platform download+install script; npm handles platform detection, file integrity (SHA512), and PATH setup natively. The `@wadeck` ecosystem already uses GitLab npm for `@wadeck/violations-cli` and `@wadeck/singleton-daemon-kit`.
**Covered by:** Decision #2.

### Embedded Node.js runtime (pkg, bun compile, deno compile)

**Reason:** Binary size 80-120 MB per platform. Embedded runtime CVEs require a full binary rebuild for every security patch. Node.js is a known, acceptable system prerequisite -- same model as Claude CLI, npm, git.
**Covered by:** Decision #1.

### Single combined @wadeck/flow-task-cli package

**Reason:** `flow` and `task` have independent release cadences. `task` does not depend on FlowEngine. A single package forces version lock-step and prevents installing only the tool you need.
**Covered by:** Decision #5.

### HTTP self-updater downloading zip artifacts

**Reason:** Replaced by `npm install -g`. npm handles platform detection, file integrity (SHA512), and atomic replacement natively. The custom HTTP updater (Ed25519 signing, zip download, atomic file replace) is wdrive's approach for GitHub Releases -- not applicable to the npm distribution model.
**Covered by:** Decision #4.

### update-check npm library

**Reason:** The library does ~30 lines of work: npm registry query, cache file, semver compare. All three are trivially implemented without a new dependency using `execFile('npm', ['view', ...])` + a JSON cache file + the `semver` package (already in node_modules as a transitive dep).
**Covered by:** Decision #4, audit finding S-01.

### Application-level artifact signing (Ed25519)

**Reason:** npm's built-in SHA512 integrity check is the accepted mitigation for this private, single-user GitLab registry. Ed25519 signing (wdrive's pattern) is not required here and would add CI complexity with no security gain for the current audience.
**Covered by:** Decision #2, threat model T-01.

### Linux/arm64 platform package

**Reason:** Current audience is Windows (primary) + macOS (arm64/x64). Linux/amd64 is in scope for containerized agents. Linux/arm64 (Raspberry Pi, AWS Graviton) is not a known use case at this time.
**Covered by:** Decision C-07.

## How to challenge scope

If you believe an item should be in scope, open a new discussion with the rationale.
Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.

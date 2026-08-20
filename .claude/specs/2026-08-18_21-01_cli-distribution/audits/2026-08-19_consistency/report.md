# Audit Report -- Consistency + Pattern Coherence -- CLI Distribution

**Date:** 2026-08-19
**Spec version:** v0.1
**Auditor:** Claude (spec mode, consistency fork)

## Scope

Files reviewed: \_index.md, guiding-principles.md, architecture-overview.md, threat-model.md, out-of-scope.md
Reference CLIs: packages/flow-cli/package.json, violations-framework/packages/violations-cli/package.json, wdrive/driver/package.json

## Executive summary

6 HIGH findings, 4 MEDIUM findings, 2 INFO findings.
Two critical gaps: (1) existing flow-cli/package.json has "name":"flow-cli" with both flow+task bins -- Decision #5 split is never addressed in the spec; (2) threat model entirely stale, all STRIDE sections still "(pending)" despite all decisions being made.

## Findings

| ID   | Severity | Finding                                                                                                                                                                                                                                                   | File / Section                                | Recommendation                                                                          |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| C-01 | HIGH     | flow-cli/package.json has "name":"flow-cli" (private, no @wadeck scope) with both flow and task bins. Decision #5 requires two separate published packages. The package split is never described in the spec.                                             | packages/flow-cli/package.json vs Decision #5 | Add module file describing how flow-cli splits into @wadeck/flow-cli + @wadeck/task-cli |
| C-02 | HIGH     | Threat model entirely stale. All STRIDE sections still say "(pending)". T-01 status "Open" despite P-6 resolving as Ed25519. T-02 status "Open" despite P-4 resolving as user-local npm install.                                                          | threat-model.md (all sections)                | Update STRIDE sections; mark T-01/T-02 as Mitigated                                     |
| C-03 | HIGH     | \_index.md Context says "wdrive: esbuild -> GitHub Release -> self-updater. This pattern is directly adaptable." -- this was corrected during the session (wdrive uses GitLab npm; daemon-based updater does not transfer). Contradicts actual decisions. | \_index.md / Context                          | Remove or rewrite stale Context section                                                 |
| C-04 | HIGH     | Threat model Asset "GitHub Release hosting" -- distribution channel is GitLab npm, not GitHub Releases. Wrong asset modelled.                                                                                                                             | threat-model.md / Assets                      | Replace with "GitLab npm registry"                                                      |
| C-05 | HIGH     | P-5 still says "Easy update path (mechanism TBD)". Decision #4 fully resolved this.                                                                                                                                                                       | guiding-principles.md / P-5                   | Update P-5 to reflect auto-update mechanism                                             |
| C-06 | HIGH     | architecture-overview.md not registered in \_index.md Modules/Sub-files table.                                                                                                                                                                            | \_index.md / Modules                          | Add architecture-overview.md to Modules table                                           |
| C-07 | MEDIUM   | P-9 appears before P-8 in guiding-principles.md.                                                                                                                                                                                                          | guiding-principles.md                         | Reorder P-8/P-9 numerically                                                             |
| C-08 | MEDIUM   | violations-cli pattern divergence not justified. violations-cli has no Go launcher; spec does not state whether it gets one in phase-2 migration.                                                                                                         | architecture-overview.md / Migration order    | Add one sentence on violations-cli launcher decision                                    |
| C-09 | MEDIUM   | "30min cache" only in architecture-overview.md runtime chain. Not in Decision #4 row or P-5.                                                                                                                                                              | \_index.md, guiding-principles.md             | Add to Decision #4 description and updated P-5                                          |
| C-10 | MEDIUM   | update-state.json path never explicitly defined. flow cli rollback reads it -- path must be canonical.                                                                                                                                                    | architecture-overview.md                      | Specify: ~/.config/flow/update-state.json                                               |
| C-11 | INFO     | Health check after update invokes "flow cli self-check" -- PATH availability in detached node subprocess not guaranteed on Windows.                                                                                                                       | architecture-overview.md / Background         | Note: invoke bundle directly (node flow.cjs --cli-self-check) not relying on PATH       |
| C-12 | INFO     | task-cli platform packages only described as "(same structure)" comment, not explicitly listed.                                                                                                                                                           | architecture-overview.md                      | Expand to list @wadeck/task-cli-win32-x64 etc. explicitly                               |

## New open questions raised

- Q1: How does the flow-cli/task-cli package split work? New packages/task-cli/ directory, or task extracted from flow-cli? (C-01)
- Q2: Will violations-cli also get a Go launcher, or stay as plain JS bin? (C-08)
- Q3: Semver starting version for stable releases -- v0.1.0 or v1.0.0? (gap from Decision #6)

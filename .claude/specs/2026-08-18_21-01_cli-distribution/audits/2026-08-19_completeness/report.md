# Audit Report -- Completeness -- CLI Distribution

**Date:** 2026-08-19
**Spec version:** v0.1
**Auditor:** Claude (spec mode)

## Scope

Files examined: \_index.md, architecture-overview.md, guiding-principles.md, threat-model.md, out-of-scope.md

## Executive summary

The spec resolves all 6 core questions and has a solid architecture overview. However, 5 significant components named in the architecture have no dedicated spec file, the threat model is entirely placeholder, and 4 critical implementation-blocking topics are absent: Node.js-not-found error behavior, Linux support, npmrc setup for new users, and breaking change / semver strategy.

## Findings

| ID   | Severity | Finding                                                                                                                                                                             | File / Section                               | Recommendation                                                                        |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| C-01 | HIGH     | UpdateManager component named in runtime chain but has no dedicated spec file -- behavior, state schema, error handling, retry, and timeout are all unspecified                     | architecture-overview.md / Runtime chain     | Create update-manager.md with state machine, state file schema, timeout/retry policy  |
| C-02 | HIGH     | flow cli self-check listed as 8 one-liners -- no pass/fail criteria, no expected outputs, no error messages defined                                                                 | architecture-overview.md / self-check        | Create self-check.md with each check's inputs, success condition, and failure message |
| C-03 | HIGH     | CI pipeline described in 6-line pseudoyaml -- no GitLab CI vs GitHub Actions decision, no actual package.json scripts, no npm auth injection, no platform package versioning detail | architecture-overview.md / Release CI        | Create ci-pipeline.md with full job definition                                        |
| C-04 | HIGH     | threat-model.md is entirely placeholder -- all STRIDE sections say pending, both mitigations are Open, decisions that affect threats not incorporated                               | threat-model.md                              | Update all STRIDE sections and mitigations based on final decisions                   |
| C-05 | HIGH     | Breaking change / semver strategy absent -- no policy on what constitutes a breaking change, no MAJOR version bump rules                                                            | \_index.md                                   | Add decision on semantic versioning rules and breaking change communication           |
| C-06 | MEDIUM   | Node.js-not-found behavior unspecified -- what happens when Go launcher cannot find node on PATH?                                                                                   | architecture-overview.md                     | Add launcher error behavior, min Node.js version check, error text                    |
| C-07 | MEDIUM   | Linux support not addressed -- only win32-x64, darwin-arm64, darwin-x64 listed. Is linux-x64 in scope?                                                                              | architecture-overview.md / package structure | Add to platform list or add to out-of-scope.md with rationale                         |
| C-08 | MEDIUM   | npmrc setup for new users not documented -- spec says already done but gives no instructions for colleagues                                                                         | architecture-overview.md / Install           | Add npmrc setup steps or create install-guide.md                                      |
| C-09 | MEDIUM   | out-of-scope.md is empty -- rejected options (GitHub Releases, embedded Node.js, combined package) not recorded                                                                     | out-of-scope.md                              | Populate with explicitly rejected options                                             |
| C-10 | MEDIUM   | P-5 still says mechanism TBD -- resolved as Decision #4 but principle text not updated                                                                                              | guiding-principles.md / P-5                  | Update P-5 body to reflect the auto-update design                                     |
| C-11 | MEDIUM   | \_index.md Summary still references wdrive as reference implementation -- stale after spec discovered wdrive uses GitHub Releases, not npm                                          | \_index.md / Summary                         | Update summary to reflect violations-framework + esbuild patterns                     |
| C-12 | INFO     | P-6 signed releases references Ed25519 -- with npm distribution, npm SHA512 lockfile handles integrity; Ed25519 may be redundant                                                    | guiding-principles.md / P-6                  | Clarify scope of Ed25519 signing under npm distribution                               |
| C-13 | INFO     | \_index.md Modules table lists only 3 initial files; architecture-overview.md not listed, planned files absent                                                                      | \_index.md / Modules                         | Update modules table                                                                  |
| C-14 | INFO     | P-8 and P-9 are numerically out of order in the file (P-9 appears before P-8)                                                                                                       | guiding-principles.md                        | Reorder                                                                               |

## New open questions raised

1. Minimum supported Node.js version? (Go launcher must check and fail clearly)
2. Is Linux (x64, arm64) in scope for initial release?
3. What is the semver / breaking-change policy?
4. Does Ed25519 artifact signing still apply when npm handles package integrity?
5. How does a new colleague set up the ~/.npmrc GitLab token?

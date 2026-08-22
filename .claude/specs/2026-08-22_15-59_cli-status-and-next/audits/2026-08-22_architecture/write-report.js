const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname);
fs.mkdirSync(dir, { recursive: true });

const report = `# Audit Report -- Architecture -- CLI Status and Next Steps
**Date:** 2026-08-22
**Spec version:** v0.1
**Auditor:** Claude (spec mode)

## Scope

Files examined:
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/_index.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/guiding-principles.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/out-of-scope.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/threat-model.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/config-dir.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/shared-cli.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/sdk-xdg.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/violations-migration.md\`
- \`.claude/specs/2026-08-22_15-59_cli-status-and-next/wdrive-migration.md\`
- \`.claude/plans/2026-08-22_cli-status-and-next.md\`

Implementation cross-checked:
- \`packages/shared-cli/src/ConfigDir.ts\`
- \`packages/shared-cli/src/UpdateManager.ts\`
- \`packages/shared-cli/package.json\`
- \`packages/flow-cli/scripts/bundle.ts\` (reference esbuild pattern)
- \`C:\\\\Workspace_Tooling\\\\violations-framework\\\\packages\\\\violations-cli\\\\src\\\\cli.ts\`
- \`C:\\\\Workspace_Tooling\\\\violations-framework\\\\packages\\\\violations-cli\\\\src\\\\compiler.ts\`
- \`C:\\\\Workspace_Tooling\\\\violations-framework\\\\packages\\\\violations-cli\\\\package.json\`

## Executive summary

The spec is well-structured and the majority of its architectural decisions are sound. Two CRITICAL blockers were found in the violations-framework esbuild migration plan that would produce a broken build and a broken CLI at runtime. D-3 is contradicted between \`_index.md\` and \`shared-cli.md\`. There are gaps in the scraper migration plan (silent data abandonment) and the violations update plan (missing updater binary). Twelve findings total: 2 CRITICAL, 4 HIGH, 4 MEDIUM, 2 INFO.

## Findings

| ID | Severity | Finding | File / Section | Recommendation |
|----|----------|---------|----------------|----------------|
| A-01 | CRITICAL | \`compiler.ts\` uses TypeScript API at runtime; cannot be bundled with \`external: []\`. \`compiler.ts\` calls \`ts.transpileModule()\`, \`ts.createProgram()\`, and \`ts.createCompilerHost()\`. TypeScript resolves its own \`lib/*.d.ts\` files via \`__dirname\`-relative paths from the package root. If TypeScript is inlined into \`violations.cjs\`, \`__dirname\` inside TypeScript code points to the bundle location rather than the TypeScript package root. \`ts.createProgram()\` fails at runtime when compiling user rule files. \`typescript\` is already in runtime \`dependencies\` in \`violations-cli/package.json\` -- it must stay external. | \`violations-migration.md\` Build pipeline \`external: []\` | Change to \`external: ['typescript']\` (minimum) in the violations esbuild config. Verify with post-bundle smoke test: \`node violations.cjs config validate\` against a real \`.violations/config.ts\`. |
| A-02 | CRITICAL | Build pipeline contradiction: \`tsc --noEmit\` then \`entryPoints: dist/cli.js\`. The spec states \`tsc --noEmit\` (no output files) but specifies \`entryPoints: dist/cli.js (after tsc compilation)\`. If tsc does not emit, \`dist/cli.js\` does not exist and esbuild fails. These are mutually exclusive. The flow-cli reference pattern emits to \`dist/\` first, then bundles from \`dist/\`. | \`violations-migration.md\` Build pipeline | Either (a) keep tsc emitting (drop \`--noEmit\`) as first build step and use \`dist/cli.js\` as entrypoint -- same as flow-cli; or (b) point esbuild directly at \`src/cli.ts\` (esbuild handles TS natively) and use \`tsc --noEmit\` purely for type-checking. Update \`scripts.build\` accordingly. |
| A-03 | HIGH | D-3 contradicted between \`_index.md\` and \`shared-cli.md\`. \`_index.md\` D-3: "shared-cli lives in its own repo" at \`https://github.com/Wadeck/shared-cli\`. \`shared-cli.md\` D-3: "Source stays in agent-fleet". Same decision number, opposite location decisions. Plan T-NEW aligns with \`_index.md\`, making \`shared-cli.md\` stale. | \`shared-cli.md\` Decisions vs \`_index.md\` D-3 | Update \`shared-cli.md\` to reflect the own-repo decision. Remove "Source stays in agent-fleet". Add a note that source moves to \`https://github.com/Wadeck/shared-cli\` as part of T-NEW. |
| A-04 | HIGH | Scraper data migration: no path for project-local data to \`~/.config/<name>/data/\`. \`migrateIfNeeded(appName)\` handles only \`%APPDATA%\\\\<appName>\` and \`~/.<appName>\`. Scrapers store data in project-local directories (neither pattern matches). Existing scraper data is silently abandoned. Users see empty \`~/.config/<name>/data/\` with no explanation, violating P-5. | \`config-dir.md\` Migration path and \`_index.md\` D-16 | Either (a) add a third candidate path to \`migrateIfNeeded\` via an optional \`legacyPaths: string[]\` argument; or (b) explicitly document in T-SCRAPERS that data is not auto-migrated and print a loud stderr warning on first run when project-local data is still detected at the old path. |
| A-05 | HIGH | Updater binary not addressed for violations-cli. \`UpdateManager.scheduleBackgroundUpdate(bundlePath)\` looks for a co-located \`violations-updater.cjs\` (or fallback \`flow-updater.cjs\`) alongside \`violations.cjs\`. The spec says nothing about building or distributing an updater binary. Without it, the code takes \`if (!updaterPath) return\` -- background updates silently do nothing. This breaks D-12 and violates P-5. | \`violations-migration.md\` Update mechanism | Add a second esbuild entrypoint to \`scripts/bundle.ts\` producing \`dist-bundle/violations-updater.cjs\` (same pattern as \`flow-updater.cjs\` in flow-cli), listed in \`package.json\` \`files\`. Or document explicit reuse of \`flow-updater.cjs\` as a cross-package runtime dependency. |
| A-06 | HIGH | \`shared-cli/package.json\` not ready for publish. \`"name": "shared-cli"\` (missing \`@wadeck/\` scope) and \`"private": true\`. \`npm publish\` will fail. T-NEW does not list these as explicit steps. | \`packages/shared-cli/package.json\` | Add to T-NEW checklist: set \`"name": "@wadeck/shared-cli"\`, remove \`"private": true\`, add \`"publishConfig"\`, add \`"exports"\` and \`"main"\` fields, add \`"preversion"\` guard script for P-6 CalVer enforcement. |
| A-07 | MEDIUM | \`migrateIfNeeded\` silent failure: empty catch block, no user notification. When migration fails (cross-device move, permissions), \`catch { }\` is completely silent. The user cannot know migration failed and their data is still at the old path. P-5 requires actionable output. | \`packages/shared-cli/src/ConfigDir.ts\` lines 27-30 | Add a \`process.stderr.write(...)\` call inside the catch block with the error message. Non-fatal is fine; fully silent is not. |
| A-08 | MEDIUM | Dynamic import \`@wadeck/violations-rules/rules/\${id}\` incompatible with \`external: []\`. \`cmdRulesInfo\` uses a template-literal dynamic import that esbuild cannot statically trace. With \`external: []\`, esbuild tries to bundle all deps and produces a build warning or incorrect output for this path. \`@wadeck/violations-rules\` is a \`peerDependency\` and must not be bundled. | \`violations-migration.md\` Build pipeline and \`violations-cli/src/cli.ts\` lines 372-378 | Add \`external: ['@wadeck/violations-rules']\` to the esbuild config alongside \`typescript\`. Peer dependencies must always be external. |
| A-09 | MEDIUM | T9 wdrive: \`wdrive-tray.exe\` Windows EPERM during npm auto-update not addressed. T8 (\`UpdateCmd\`) has the Go launcher exit before npm overwrites it. However, \`@wadeck/wdrive-win32-x64\` also ships \`wdrive-tray.exe\`. If the tray is running when \`npm install -g\` runs, npm will fail with EPERM on the tray binary even after the launcher has exited. | \`wdrive-migration.md\` T8 / T9 | T8 must also specify that the Go launcher signals \`wdrive-tray.exe\` to exit before UpdateCmd fires, and waits for that exit. Document as a T8 sub-requirement; address UX impact (no unexpected tray error notification). |
| A-10 | MEDIUM | \`getPackageVersion()\` has a P-5-violating silent fallback returning \`'0.0.0'\`. After migration this is replaced by \`__VIOLATIONS_CLI_VERSION__\`, but it is not listed in "What is removed". If accidentally retained, the fallback silently produces a wrong version. | \`violations-migration.md\` What is removed | Add \`getPackageVersion()\` to the "What is removed" list. Explicitly list its callers that are replaced by the build-time constant. |
| A-11 | INFO | T-05 threat mitigation (root/admin self-check) has no implementation task. Threat T-05 is "Open" in \`threat-model.md\`. The plan lists it only as a future TODO. No task, owner, or acceptance criteria exists. | \`threat-model.md\` T-05 | Either create a task with implementation steps (add root/admin check in self-check logic), or formally accept the risk and change T-05 to "Accepted risk" with rationale. Do not leave as "Open" with no owner. |
| A-12 | INFO | T-06 shared-cli version pinning: listed as "Resolved by D-3" but D-3 does not address pinning. D-3 covers CalVer publishing and own-repo location. It says nothing about range vs exact pinning. A range allows a compromised patch to auto-install; an exact pin requires manual updates for every fix. | \`threat-model.md\` T-06 | Explicitly decide the pinning strategy and document it in \`shared-cli.md\` security section. Close T-06 properly. |

## New open questions raised

| ID | Question | Priority | Blocking |
|----|----------|----------|---------|
| NQ-1 | For violations esbuild: use \`src/cli.ts\` directly as esbuild entry (tsc --noEmit for type-check only), or compile to \`dist/\` first then bundle from \`dist/cli.js\`? Affects build script and CI design. | High | A-02 |
| NQ-2 | Does violations-cli need its own \`violations-updater.cjs\` bundle, or reuse \`flow-updater.cjs\` distributed alongside it? The latter creates a cross-package runtime dependency. | High | A-05 |
| NQ-3 | wdrive-tray.exe EPERM: should T8 UpdateCmd terminate the tray before \`npm install\` runs, or should the updater retry on EPERM? What is the UX impact of killing the tray mid-session? | Medium | A-09 |
| NQ-4 | Scraper data migration: extend \`migrateIfNeeded\` with optional \`legacyPaths: string[]\`, or document it as a manual step with a first-run warning? | Medium | A-04 |
`;

fs.writeFileSync(path.join(dir, 'report.md'), report, 'utf8');
console.log('report.md written, ' + report.length + ' chars');

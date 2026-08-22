import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportPath = join(__dirname, 'report.md');

const content = `# Audit Report -- Completeness -- CLI Status and Next Steps
**Date:** 2026-08-22
**Spec version:** v0.1
**Auditor:** Claude (spec mode)

## Scope

Files examined (9 total):
- \`_index.md\` -- decision log, open questions, module index, changelog
- \`guiding-principles.md\` -- P-1 through P-6
- \`out-of-scope.md\` -- explicitly excluded items
- \`threat-model.md\` -- STRIDE analysis and mitigations table
- \`shared-cli.md\` -- shared-cli package scope, publishing, design
- \`config-dir.md\` -- config directory strategy, resolution algorithm, migration
- \`sdk-xdg.md\` -- singleton-daemon-kit XDG support (T5)
- \`violations-migration.md\` -- violations-framework esbuild + shared-cli migration (T4)
- \`wdrive-migration.md\` -- wdrive npm migration plan (T7-T9)

---

## Executive summary

The spec is structurally complete for its 8 documented modules. All listed modules have files, all 10 open questions carry a resolution reference, and all 17 decisions carry rationale. However, two CRITICAL issues were found: a direct contradiction between shared-cli.md and the _index.md decision log on where the shared-cli source lives, and a config-dir.md design step that silently swallows migration failures in direct violation of guiding principle P-5. One HIGH gap exists: scrapers consolidation (4 decisions: D-6, D-14, D-15, D-16) has no corresponding module file despite being described as part of the spec scope. Six additional MEDIUM/INFO gaps round out the 10 findings.

---

## Findings

| ID | Severity | Finding | File / Section | Recommendation |
|---|---|---|---|---|
| C-01 | CRITICAL | Contradiction on shared-cli source location. \`shared-cli.md\` Overview states "It lives in \`packages/shared-cli/\` inside the agent-fleet monorepo." \`_index.md\` D-3 and D-9 both state it lives in its own repo at \`C:\\\\Workspace_Tooling\\\\shared-cli\` / \`https://github.com/Wadeck/shared-cli\`. These are mutually exclusive. | \`shared-cli.md\` Overview vs \`_index.md\` D-3, D-9 | Align \`shared-cli.md\` to the current decision: source is in its own repo. The mention of \`packages/shared-cli/\` is a stale pre-D-9 description and must be removed. |
| C-02 | CRITICAL | \`config-dir.md\` migration step 5 silently swallows failure, contradicting P-5. Step 5 reads: "Non-fatal on failure (cross-device move, permissions)". P-5 (Fail loudly) forbids silent fallbacks. A failed migration leaves the CLI reading from the old path without any indication to the user. | \`config-dir.md\` Migration path -- step 5 | Either (a) make migration failure fatal with a clear error message, or (b) document the P-5 exception as a named decision with rationale (e.g., "migration failure is non-fatal because the old dir still works; user is warned via stderr"). |
| C-03 | HIGH | No module file for scrapers consolidation. The \`_index.md\` Summary lists scrapers (assurance, whatsapp, chatgpt) as part of the spec scope, and decisions D-6, D-14, D-15, D-16 all cover scraper architecture. The Modules table has no \`scrapers.md\` entry, and no such file exists. Design details for \`@wadeck/shared-scrapper\`, monorepo layout, ConfigDir adoption, and CI are undocumented. | \`_index.md\` Modules table | Add \`scrapers.md\` covering: monorepo structure at \`C:\\\\Workspace_Tooling\\\\scrappers\`, \`@wadeck/shared-scrapper\` scope, ConfigDir usage per D-16, CI strategy, and relationship to \`@wadeck/shared-cli\`. Register it in the Modules table. |
| C-04 | HIGH | D-17 duplicated in \`wdrive-migration.md\` with different rationale. The Decisions table contains D-17 twice: first with rationale "Avoids B2 (two dirs for one tool)", then "Multi-instance is a core wdrive feature". These are two distinct decisions sharing the same ID. | \`wdrive-migration.md\` Decisions -- rows 3 and 4 | Assign a new decision ID (D-18) to "wdrive \`--config <dir>\` override preserved in T9 migration" and register it in \`_index.md\` Decision Log. |
| C-05 | MEDIUM | \`shared-cli.md\` Publishing section still open despite Q-1 being marked resolved. Q-1 in \`_index.md\` is listed "Resolved by D-3" but \`shared-cli.md\` Publishing reads only "Open question Q-1: CalVer vs semver, CI trigger, version pinning in consumers." -- the actual resolution content is absent. | \`shared-cli.md\` Publishing | Replace the placeholder with the resolution: CalVer format \`1.YYYYMMDDHHMMSS.BUILD\`, CI-triggered publish on merge to main, version pinning strategy (range vs exact per T-06). |
| C-06 | MEDIUM | Unregistered open question in \`threat-model.md\`. The threat-model notes "Q: T-05 -- should self-check explicitly verify it is not running as root/admin? -> new open question candidate". This was never added to \`_index.md\` Open Questions and has no resolution. | \`threat-model.md\` Open security questions | Add as Q-10 in \`_index.md\` Open Questions with status "Open". Decide before T4/T9 implementation begins (both reference T-05). |
| C-07 | MEDIUM | Three threat mitigations are "Open" with no linked decision or resolution path. T-03 (auth token plaintext), T-05 (EoP), and T-06 (shared-cli supply chain) have Status: "Open" with no associated Decision # or target milestone. | \`threat-model.md\` Mitigations table | For each: either accept the risk with a formal decision ID, assign a milestone, or add to Open Questions. "Open" with no owner is not actionable. |
| C-08 | MEDIUM | Changelog not updated after D-8 through D-17 were added. The sole changelog entry reads "D-1 through D-7 documented" but the Decision Log contains D-1 through D-17 (17 decisions). | \`_index.md\` Changelog | Add a v0.1 revision row noting "D-8 through D-17 added; Q-1 through Q-9 all resolved; 3 new open questions registered". |
| C-09 | INFO | P-4 (Distribute via npm only) not explicitly cited in any decision rationale. P-4 justifies the wdrive npm migration, violations bundle distribution, and the exe-in-npm pattern, yet no Decision Log entry references it. | \`_index.md\` Decision Log (D-11, D-13) | Add P-4 to the rationale of D-11 and D-13 for principle traceability. |
| C-10 | INFO | Scope ambiguity between scrapers consolidation (in scope) and scrapers distribution (out of scope). \`_index.md\` Summary lists scrapers as part of the harmonization scope; \`out-of-scope.md\` excludes scrapers distribution. The boundary is not stated in the Summary or Modules section. | \`_index.md\` Summary and \`out-of-scope.md\` | Add one sentence to the Summary: "Scrapers consolidation (monorepo, shared-scrapper, ConfigDir) is in scope; scrapers distribution (npm global publish) is not." |

---

## New open questions raised

| # | Question | Raised by | Priority |
|---|---|---|---|
| Q-10 | Should self-check in CLIs (flow-cli, violations-cli, wdrive post-T9) explicitly verify the process is not running as root/admin, and if so fail fast or just warn? | C-06 / threat-model T-05 | Medium |
| Q-11 | What is the pinning strategy for \`@wadeck/shared-cli\` in consumer package.json: exact CalVer (\`1.20260822120000.1\`) or caret range (\`^1.0.0\`)? The answer determines the blast radius of T-06 (supply chain compromise). | C-05 / threat-model T-06 | Medium |
`;

writeFileSync(reportPath, content, 'utf8');
console.log('Written', content.length, 'bytes to', reportPath);

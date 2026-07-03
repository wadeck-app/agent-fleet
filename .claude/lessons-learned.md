# Lessons learned

<!-- Last updated: 2026-07-03T15:36:05.712Z -->

## Recurring feedback

<!-- session 0b3d4416 2026-06-19 -->
- Proposed solutions without testing first (skill docs for `flow generate`, flow-cli global installation) — user had to ask "t'as fait des tests pratiques ?"
- Didn't proactively capture brainstorming insights into documentation; user had to explicitly ask "capture tout dans les notes" multiple times
- Agent added emojis to plan files (✅🔲📋✦❓) despite CLAUDE.md explicitly forbidding unicode/emojis in all output. User corrected: "avoid all emojis or special unicode please... as written in CLAUDE.md!"

<!-- session 36b7bcaa 2026-06-19 -->
- User emphasized "facts only — no guesses" and "very thoroughly" before accepting conclusions. Multiple grep/bash verification cycles were needed to establish ground truth before making code changes.

## Agent errors

<!-- session 0b3d4416 2026-06-19 -->
- Wrong assumption: monorepo is source-only (no dist output), so `npm link` binary can't resolve imports without hardcoding the tsx path in the bin wrapper — flow-cli was never designed for global CLI installation
- Wrong assumption: policies could live in flow definitions; user corrected: policies are independent concern, loaded per agent/role, never embedded in flows
- Wrong assumption: `proposals/` directory needed for in-progress flows; user corrected: flow YAML lives wherever the spec/plan lives, no special directory overhead
- Wrong assumption: multiple policies per YAML file acceptable; user corrected: one policy = one file is the norm, mixing concerns violates single-responsibility
- Wrong assumption: dirty workspace after failed step doesn't require checkpointing; user corrected: resumable flows need full state snapshots + auto-commit strategy post-step
- Created test files with incorrect vitest/ESM mock patterns: `mockImplementation(...as never)` and `mockReturnValue(() => ({ run: mockRun }))` should have been plain object returns like `mockReturnValue({ run: mockRun })`. Not caught until test execution revealed "is not a constructor" errors.
- Attempted multiple approaches to run tests (run-test skill → failed; subprocess skill → spawn issues; check skill → not included in test-config.js) without being upfront about the limitation. Eventually resorted to manual code analysis instead of admitting inability to execute bash commands.
- Attempted to invoke subprocess skill at 20:26:46 without verifying availability first; returned "NOT YET KNOWN" — skills should be checked or gracefully handled when not available.

<!-- session 36b7bcaa 2026-06-19 -->
- Initial assumption that flows-custom.yml is auto-loaded by FlowRegistry in CLI; investigation revealed only flows.yml loads in constructor without explicit loadProjectFlows() call. FlowCliRunner never calls loadProjectFlows().
- bin/flow.js incorrectly referenced non-existent dist/ directory; actual execution requires tsx loader pointing to TypeScript src/cli.ts.
- Package.json exports field missing from flow-engine, causing import resolution failures downstream (web-backend, worker, orchestrator). "main" field alone insufficient.

## Documentation gaps

<!-- session 0b3d4416 2026-06-19 -->
- Missing: monorepo's source-only architecture (tsx + path aliases, no dist) breaks standard npm link workflows — requires bin wrapper with hardcoded tsx path
- Missing: flow-cli designed for monorepo context (`--cwd` override needed for external projects), not truly portable as documented
- When user asked for the brainstorming file content, agent said "41KB, too large to display directly" instead of offering to show specific sections or a summary. Communication gap, not a technical blocker.
- package.json exports configuration for flow-engine wasn't intuitive — user needed to debug why CLI imports failed; also npm link setup for global binaries and bin/ script configuration not documented.

<!-- session 36b7bcaa 2026-06-19 -->
- SKILL.md claims contradicted implementation: "Discovering registered flow IDs" section implied flows-custom.yml loaded, but custom flows require explicit user action to register. Blind review process (read doc → read impl → report) was correct approach, not followed initially.

## Known constraints

<!-- session 0b3d4416 2026-06-19 -->
- `packages/flow-cli` is not in monorepo `test-config.js`, so `run-test` skill cannot run it — must use `npm run test --workspace=flow-cli` directly. No error messaging when the skill was invoked.
- Skills in `.claude/skills/` must be directories with `SKILL.md` inside, not standalone markdown files (user manually migrated from `flow.md` to `flow/SKILL.md`).

<!-- session 36b7bcaa 2026-06-19 -->
- FlowCliRunner must call registry.loadProjectFlows(projectRoot) during initialization to make project flows discoverable; currently missing—breaks "flow run custom-flow-id" lookups.

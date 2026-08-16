# Plan: Plugin System Implementation

**Created:** 2026-08-16
**Spec:** `.claude/specs/2026-08-16_09-48_plugin-system/`
**Approach:** TDD -- write tests first, implement, check + violations after every phase
**Status:** Ready to start

---

## Guiding rules for this plan

- Each phase ends with: `npm run check` + `npm run test:agent` (bail on first failure)
- No phase starts until the previous one passes all checks
- After phases 3, 6, and 9: run `/subprocess review` on changed files
- All new packages follow `packages/plugin-<id>` convention
- PLUGIN-001 to PLUGIN-010 violation rules are added in Phase 2 and enforced from Phase 3 onward

---

## Phase 1 -- `packages/extension-points` (foundation)

**Goal:** Create the `@flow/extension-points` package with the typed interfaces and registry.

Steps:
1. Create `packages/extension-points/package.json` (name: `@flow/extension-points`)
2. Write `extension-points.json` (copy from spec: workspace stable v1, approval stable v1, tasks/secrets/agent/model/script/context planned)
3. Write `src/workspace/v1.ts` -- `WorkspaceProvider`, `WorkspaceRequest`, `WorkspaceHandle`
4. Write `src/approval/v1.ts` -- `ApprovalProvider`, `InputRequest`, `ChoiceRequest`, `ApprovalRequest`
5. Write `src/index.ts` -- re-exports latest of each
6. **Tests:** `extension-points.test.ts` -- import each interface, assert the shape compiles, assert JSON registry is valid against a schema
7. `npm run check` -- must pass clean

---

## Phase 2 -- `packages/plugin-sdk` + violation rules

**Goal:** Create `@flow/plugin-sdk` with PluginManifest type, path validation helpers, and sensitiveFields baseline. Add PLUGIN-001--010 violation rules.

Steps:
1. Create `packages/plugin-sdk/package.json` (name: `@flow/plugin-sdk`)
2. Write `src/manifest.ts` -- `PluginManifest`, `PluginImplementation` types (per spec schema)
3. Write `src/sensitiveFields.ts` -- baseline list: `token`, `password`, `secret`, `key`, `apiKey`, `privateKey`, `accessToken`, `bearerToken`
4. Write `src/pathValidation.ts` -- `validateWorkspacePath`, `validateBaseDir`, `validateTaskIdForBranchName`, `validateBranchNamePrefix`
5. **Tests first:** write tests for each validation function (happy path + rejection cases per spec)
6. Implement validation functions to pass tests
7. Add `.violations/rules/plugin-rules.ts` implementing PLUGIN-001 to PLUGIN-010
8. `npm run check` + `npm run violations` -- must pass clean

---

## Phase 3 -- Config loader

**Goal:** CLI can load and merge global config + project config into resolved plugin instances.

Steps:
1. Create `packages/flow-cli/src/config/PluginConfig.ts` -- types for global/project config YAML
2. Create `packages/flow-cli/src/config/ConfigLoader.ts`
   - Resolves `FLOW_CONFIG` env var or `~/.flow/config.yml`
   - Hard error if `FLOW_CONFIG` set but file missing (P-4)
   - Parses and validates global config (credential literal check for sensitive fields across all option layers)
   - Loads project config from `<cwd>/.flow/config.yml`
   - Merges: instance lookup for `use:`, inline for `instance:`, hard error if both present, hard error if neither for required features (workspace only)
3. **Tests first:** unit tests covering all merge/error scenarios from spec
4. Implement to pass tests
5. `npm run check` -- violations run on new files
6. **Subprocess review** of config loader code

---

## Phase 4 -- Plugin loader (resolves Q1)

**Goal:** CLI can resolve `plugins.<pluginId>.<implName>` to a provider instance.

Steps:
1. Create `packages/flow-cli/src/config/PluginLoader.ts`
   - `require.resolve("@flow/plugin-<pluginId>/plugin.config")` or `plugin.manifest.json` fallback
   - Assert `manifest.pluginId === pluginId` (PLUGIN-002 runtime enforcement)
   - Lookup `manifest.implementations[extensionPoint][implName]`
   - Version check against `extension-points.json`
   - For TS manifest: call `impl.provider(mergedOptions)` (factory)
   - For JSON manifest: `require(entrypoint)[export](mergedOptions)` + entrypoint existence check
2. **Tests first:** mock manifests covering valid, wrong pluginId, wrong version, missing impl
3. Implement to pass tests
4. `npm run check`

---

## Phase 5 -- `packages/plugin-none`

**Goal:** First workspace plugin -- trivial, validates the entire pipeline end to end.

Steps:
1. Create `packages/plugin-none/`
2. **Test first:** write `NoneWorkspaceProvider.test.ts` -- `allocate()` returns cwd, `release()` is no-op, handle id starts with `none:`
3. Write `src/NoneWorkspaceProvider.ts` to pass tests (annotate `// @plugin-009-exempt: no-taskId-path-construction`)
4. Write `plugin.config.ts` manifest (pluginId: "none", implementations.workspace.default, version: 1)
5. `npm run violations` -- PLUGIN-001 to 010 must all pass
6. Integration test: load config with `type: plugins.none.default`, allocate, release
7. `npm run check`

---

## Phase 6 -- `packages/plugin-worktree`

**Goal:** Worktree workspace provider with full path safety.

Steps:
1. Create `packages/plugin-worktree/`
2. **Tests first:**
   - `validateBaseDir` rejects `/`, system dirs, project root ancestors, nested worktrees
   - `validateWorkspacePath` rejects path traversal
   - `validateTaskIdForBranchName` rejects illegal git ref chars
   - `validateBranchNamePrefix` same
   - `allocate()` calls all 4 validators before path construction
   - `allocate()` errors if workspace already exists
   - `release()` propagates error if no prior error; logs warning if prior error exists
3. Write `src/WorktreeWorkspaceProvider.ts` to pass tests (array-argument git calls via `execa`)
4. Write `plugin.config.ts`
5. `npm run violations` -- all pass
6. Integration test (requires git repo): allocate creates worktree + branch, release removes it
7. `npm run check`
8. **Subprocess review** of worktree provider

---

## Phase 7 -- `packages/plugin-cli-approval`

**Goal:** CLI terminal approval plugin (readline-based).

Steps:
1. Create `packages/plugin-cli-approval/`
2. **Tests first:** mock readline, test `requestInput`, `requestChoice`, `requestApproval` outputs and return values
3. Implement `src/CliApprovalProvider.ts`
4. Write `plugin.config.ts`
5. `npm run violations` -- all pass
6. `npm run check`

---

## Phase 8 -- flow-engine refactor (inject ApprovalProvider)

**Goal:** Remove hardcoded intervention delivery from StepRunner; inject ApprovalProvider.

Files to adjust (per spec `approval-provider.md § Required code adjustments`):
1. `packages/flow-engine/src/executor/StepRunner.ts` -- receive `ApprovalProvider` via constructor; route `request_user_input`/`request_user_choice`/`request_user_approval` tool-calls to provider methods
2. `packages/flow-engine/src/tools/ToolCallInjector.ts` -- route to `approvalProvider.*` instead of `InterventionRequest` creation
3. `packages/flow-engine/src/executor/FlowOrchestrator.ts` -- inject resolved `ApprovalProvider` (optional feature: only fail if provider is invoked and missing)

Steps:
1. **Tests first:** update StepRunner tests to inject mock ApprovalProvider; assert HITL tool-calls route correctly
2. Refactor StepRunner
3. Update FlowOrchestrator tests
4. Refactor FlowOrchestrator
5. `npm run check` + `npm run test:agent` -- all existing tests must still pass
6. **Subprocess review** of engine refactor

---

## Phase 9 -- Wire up CLI startup

**Goal:** `flow run` and `task run` load config, resolve plugins, pass providers to engine.

Steps:
1. Update `packages/flow-cli/src/cli/commands/RunCommand.ts`
   - Load config via `ConfigLoader`
   - Resolve workspace provider via `PluginLoader`
   - Resolve approval provider if configured (optional)
   - Pass to `FlowOrchestrator`
2. **Tests first:** integration test with `plugin-none` workspace + `plugin-cli-approval`
3. Implement
4. `npm run check` + `npm run test:agent`
5. **Full audit:** `/subprocess review` on all changed files
6. **`/spec audit completeness`** on the plugin system spec to verify alignment

---

## Phase 10 -- Violation rules wired into CI

**Goal:** PLUGIN-001--010 run automatically on every `packages/plugin-*` change.

Steps:
1. Add `plugin-*` glob to `.violations/config.ts` targets
2. Verify all 5 existing plugin packages pass clean
3. `npm run violations` -- final clean run
4. Update `.claude/kb/lessons-learned.md` with plugin system gotchas

---

## Quality gates summary

| After phase | Gate |
|---|---|
| 1 | `check` passes |
| 2 | `check` + `violations` pass |
| 3 | `check` + subprocess review |
| 4 | `check` passes |
| 5 | `check` + `violations` + integration test |
| 6 | `check` + `violations` + integration test + subprocess review |
| 7 | `check` + `violations` |
| 8 | `check` + `test:agent` + subprocess review |
| 9 | `check` + `test:agent` + subprocess review + spec audit |
| 10 | `violations` clean on all plugin-* |

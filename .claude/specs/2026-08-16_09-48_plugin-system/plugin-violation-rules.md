# Plugin Violation Rules -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

These rules are enforced as local violation checks (`.violations/config.ts`) for any
`packages/plugin-*` package in the monorepo. They ensure structural correctness and
interface compliance before a plugin can be used or published.

## Rules

### PLUGIN-001: Manifest file must exist

Every `packages/plugin-<id>` directory must contain either `plugin.config.ts` OR `plugin.manifest.json`.

**Why:** Without a manifest the CLI cannot discover or load the plugin. Failing silently at load time is worse than failing at lint time.

**Check:** Glob `packages/plugin-*/` and assert at least one of the two manifest files is present.

---

### PLUGIN-002: Manifest pluginId must match package directory name

The `pluginId` field in the manifest must equal the `<id>` part of the `packages/plugin-<id>` directory name.

**Why:** Prevents copy-paste errors where a cloned plugin still carries the original plugin's ID, causing silent aliasing in the registry.

**Check:** Parse manifest, compare `pluginId` against directory name suffix.

---

### PLUGIN-003: Every declared implementation must be resolvable

For each implementation declared in the manifest:

- **TS manifest (`plugin.config.ts`):** the `provider` export must exist and TypeScript must accept it as satisfying the interface type for the declared `version` integer. This is enforced by the build (tsc), so the violation rule checks that the build succeeds without errors.
- **JSON manifest:** `entrypoint` file must exist and `export` must be a named export of that file.

**Why:** A manifest that points to a non-existent or wrongly-typed export will crash the CLI at load time with a cryptic error.

**Check:** For JSON: assert file exists + static export name check. For TS: assert `tsc --noEmit` passes for the package.

---

### PLUGIN-004: All declared extension points must be registered

Every extension point key used in `implementations` (e.g., `"tasks"`, `"workspace"`) must be a known registered extension point in `@flow/extension-points`.

**Why:** A typo in an extension point name (`"task"` instead of `"tasks"`) silently means the implementation is never loaded. Fail at lint time.

**Check:** Read the registered extension point IDs from `packages/extension-points/extension-points.json` (field: `extensionPoints[].id`) and assert all keys in the manifest are present in that list.

---

### PLUGIN-005: Interface version must be a supported version

The `version` value (integer) for each implementation must be a known version for its extension point in `@flow/extension-points`.

**Why:** An unknown or future interface version declared in the manifest will cause a runtime mismatch error when the CLI tries to call the provider. Catch it earlier.

**Check:** Read supported versions from `packages/extension-points/extension-points.json` (field: `extensionPoints[].versions[].version` for the matching extension point ID) and assert all `version` values declared in the manifest are present.

---

### PLUGIN-006: manifestVersion must be a supported manifest schema version

The `manifestVersion` field must be a value the current CLI version can parse.

**Why:** Forward compatibility -- a manifest written for a future schema version will fail to parse on an older CLI. Explicit version mismatch error is better than a JSON parse failure.

**Check:** Assert `manifestVersion` is in the CLI's supported manifest schema versions list.

---

### PLUGIN-007: No credentials or env var interpolation in manifest

The manifest must not contain any `${...}` patterns or values matching known sensitive field names (token, password, secret, key, apiKey).

**Why:** The manifest is code, not config. Any credentials accidentally placed there would end up committed to the repository.

**Check:** Check for key-value pairs where the **key** matches a known sensitive field name AND the **value** is a non-`${...}` string literal. This is a structural check (key-value pair), not a bare string scan, to avoid false positives on valid `sensitiveFields: ["token", "apiKey"]` array declarations. The `sensitiveFields` array itself is explicitly exempt from this check. Also scan for `${` patterns in all non-`sensitiveFields` values.

---

### PLUGIN-008: JSON entrypoint paths must stay within the package

`entrypoint` values in JSON manifests must be relative paths that do not traverse outside the package root (no `../` segments after normalization).

**Why:** Path traversal in an entrypoint would load arbitrary code from outside the plugin package.

**Check:** Normalize the path and assert it resolves within the package root.

---

---

### PLUGIN-009: Workspace providers must use SDK path validation for taskId

Any plugin implementing the `workspace` extension point must validate the `taskId` parameter before using it in filesystem path construction. The validation must:

1. Reject any `taskId` containing `/`, `\`, or `..` segments.
2. Assert the fully resolved workspace path starts with the fully resolved `baseDir`.

**Why:** A `taskId` containing path traversal sequences (e.g., `../../etc`) combined with `path.join(baseDir, taskId)` produces a path outside `baseDir`, directly bypassing the T-03 mitigation.

**Check:** A helper function `validateWorkspacePath(taskId: string, baseDir: string)` will be provided in `@flow/plugin-sdk/src/pathValidation.ts`. Workspace provider implementations must call it before any `allocate()` path construction. Lint check: assert the import and call are present in any file that exports a `WorkspaceProvider` implementation AND performs path construction with `taskId` (calls `path.join`, `path.resolve`, or equivalent using `taskId`). Implementations that never use `taskId` in path construction (e.g., `plugin-none` which returns `process.cwd()` unconditionally) are exempt -- annotate with `// @plugin-009-exempt: no-taskId-path-construction`.

**Additional check for branch-based workspace providers:** If `taskId` or `prefix` are used to construct a git branch name, both must pass the git ref-name allowlist (`^[a-zA-Z0-9._-]+$`) via `validateTaskIdForBranchName(taskId)` and `validateBranchNamePrefix(prefix)` from `@flow/plugin-sdk/src/pathValidation.ts`. Validating only `taskId` is insufficient -- a `prefix` containing illegal characters (space, `~`, `^`, `:`) would produce an invalid branch name even when `taskId` passes. All git commands must use array-argument APIs (e.g., `execa(['git', 'worktree', 'add', '-b', branchName, path])`), never shell string interpolation.

---

---

### PLUGIN-010: Workspace providers must use SDK baseDir validation

Any plugin implementing the `workspace` extension point must validate `baseDir` before use.

**Why:** A misconfigured `baseDir: /` passes the nested-worktree check while placing worktrees in the filesystem root. Calling `validateWorkspacePath` alone does not help if `baseDir` itself is dangerous.

**Check:** Workspace provider implementations must call `validateBaseDir(baseDir)` from `@flow/plugin-sdk/src/pathValidation.ts` before any `allocate()` call. The function must reject: `/`, well-known system directories (`/etc`, `/usr`, `/bin`, etc.), any path that is an ancestor of the current project root, and any path that resolves to a location already under an active git worktree (git rejects nested worktrees with an opaque error). Lint check: assert the import and call are present alongside `validateWorkspacePath`.

---

## Future rules (not yet implemented)

- **PLUGIN-011:** Each implementation name must be unique within an extension point (no two `public` under `tasks`). -- trivially enforced by JSON object keys, but worth an explicit check for clarity.
- **PLUGIN-012:** Deprecated `version` values should emit a warning (not error) with a migration path.

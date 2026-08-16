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
- **TS manifest (`plugin.config.ts`):** the `provider` export must exist and TypeScript must accept it as satisfying the declared `interfaceVersion` type. This is enforced by the build (tsc), so the violation rule checks that the build succeeds without errors.
- **JSON manifest:** `entrypoint` file must exist and `export` must be a named export of that file.

**Why:** A manifest that points to a non-existent or wrongly-typed export will crash the CLI at load time with a cryptic error.

**Check:** For JSON: assert file exists + static export name check. For TS: assert `tsc --noEmit` passes for the package.

---

### PLUGIN-004: All declared extension points must be registered

Every extension point key used in `implementations` (e.g., `"tasks"`, `"workspace"`) must be a known registered extension point in `@flow/plugin-sdk`.

**Why:** A typo in an extension point name (`"task"` instead of `"tasks"`) silently means the implementation is never loaded. Fail at lint time.

**Check:** Read the registered extension point IDs from `@flow/plugin-sdk/extension-points.ts` and assert all keys in the manifest are present in that list.

---

### PLUGIN-005: Interface version must be a supported version

The `interfaceVersion` value for each implementation (e.g., `"tasks@1"`) must be a known version in `@flow/plugin-sdk`.

**Why:** An unknown or future interface version declared in the manifest will cause a runtime mismatch error when the CLI tries to call the provider. Catch it earlier.

**Check:** Read supported versions from `@flow/plugin-sdk/interface-versions.ts` and assert all `interfaceVersion` values are present.

---

### PLUGIN-006: manifestVersion must be a supported manifest schema version

The `manifestVersion` field must be a value the current CLI version can parse.

**Why:** Forward compatibility -- a manifest written for a future schema version will fail to parse on an older CLI. Explicit version mismatch error is better than a JSON parse failure.

**Check:** Assert `manifestVersion` is in the CLI's supported manifest schema versions list.

---

### PLUGIN-007: No credentials or env var interpolation in manifest

The manifest must not contain any `${...}` patterns or values matching known sensitive field names (token, password, secret, key, apiKey).

**Why:** The manifest is code, not config. Any credentials accidentally placed there would end up committed to the repository.

**Check:** String-scan the manifest file for `${` and for known sensitive field names with non-empty values.

---

### PLUGIN-008: JSON entrypoint paths must stay within the package

`entrypoint` values in JSON manifests must be relative paths that do not traverse outside the package root (no `../` segments after normalization).

**Why:** Path traversal in an entrypoint would load arbitrary code from outside the plugin package.

**Check:** Normalize the path and assert it resolves within the package root.

---

## Future rules (not yet implemented)

- **PLUGIN-009:** Each implementation name must be unique within an extension point (no two `public` under `tasks`). -- trivially enforced by JSON object keys, but worth an explicit check for clarity.
- **PLUGIN-010:** Deprecated `interfaceVersion` values should emit a warning (not error) with a migration path.

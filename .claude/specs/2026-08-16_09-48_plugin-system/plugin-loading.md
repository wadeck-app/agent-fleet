# Plugin Loading Mechanism -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Stub -- Open Question #1, must be resolved before production use

## Overview

This file specifies how the CLI resolves a plugin type reference (`plugins.<pluginId>.<implName>`)
to a loaded TypeScript provider instance. This is the missing piece that links config resolution
(plugin-architecture.md) to the actual runtime provider object.

## Status

Open Question #1 (High priority, _index.md). The loading mechanism is required before:
- Any STRIDE spoofing mitigations can be fully enforced at runtime (threat-model.md § Spoofing)
- The PLUGIN-002 violation rule (pluginId matches directory name) has runtime enforcement
- Any plugin can be safely loaded in production

## Known constraints (to incorporate in design)

1. **Path convention (v1 monorepo):** `plugins.<pluginId>.<implName>` maps to `packages/plugin-<pluginId>` package. The CLI resolves the manifest from that package via `require.resolve("@flow/plugin-<pluginId>/plugin.config")` (or `plugin.manifest.json` fallback).

2. **Security requirement (PLUGIN-002):** After loading the manifest, the CLI must assert that `manifest.pluginId === pluginId` (extracted from the type reference). If they differ: hard error, do not load the plugin.

3. **Implementation lookup:** After loading the manifest, the CLI looks up `manifest.implementations[extensionPoint][implName]`. If not found: hard error ("plugin `<pluginId>` does not provide implementation `<implName>` for extension point `<extensionPoint>`").

4. **Version check (PLUGIN-005):** The declared `version` integer is checked against the CLI's supported versions list from `extension-points.json`. If not supported: hard error.

5. **Provider instantiation:** For TS manifests, `impl.provider` is a factory function -- call it with the merged options to get the provider instance: `impl.provider(mergedOptions)`. Zero-option providers (e.g., `none`) use `() => provider` -- the CLI calls `impl.provider({})` and the factory ignores the argument. For JSON manifests, `require(impl.entrypoint)[impl.export]` is the factory -- validate it duck-types against the expected interface at this point (not deferred to first use, per P-4).

## Design still needed

- The exact module resolution strategy for JSON manifests (entrypoint path normalization)
- The duck-type validation mechanism for JSON manifests at load time
- How provider instances are cached (singleton per instance name, or new instance per flow?)
- How the loading mechanism works outside the monorepo (v2: npm packages)

## Open questions for this module

- Instance singleton vs new-per-flow: should `my-worktree` be instantiated once at startup or per flow execution?
- Error recovery: if a plugin fails to load, should the CLI fail fast (P-4) or skip and warn?
  (P-4 suggests fail fast -- but worth documenting explicitly.)

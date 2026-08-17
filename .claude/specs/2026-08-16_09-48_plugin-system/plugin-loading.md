# Plugin Loading Mechanism -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Stub -- Open Question #1, must be resolved before production use

## Overview

This file specifies how the CLI resolves a plugin type reference (`plugins.<pluginId>.<implName>`)
to a loaded TypeScript provider instance. This is the missing piece that links config resolution
(plugin-architecture.md) to the actual runtime provider object.

## Status

Open Question #1 (High priority, \_index.md). The loading mechanism is required before:

- Any STRIDE spoofing mitigations can be fully enforced at runtime (threat-model.md § Spoofing)
- The PLUGIN-002 violation rule (pluginId matches directory name) has runtime enforcement
- Any plugin can be safely loaded in production

## Decisions

| #   | Decision                                                                                               | Rationale                                                                                                                                                                                                                                                                                                           | Date       |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| L1  | Default plugin resolution via `createRequire(import.meta.url).resolve('plugin-<id>/plugin.config.js')` | Plugins are npm dependencies of `flow-cli`; Node.js module resolution handles location transparently regardless of CWD. Using `process.cwd()` as base is wrong and breaks when CLI is invoked from outside the monorepo. `createRequire` from `import.meta.url` scopes resolution to `flow-cli`'s own node_modules. | 2026-08-17 |
| L2  | Per-plugin `pluginsDir` override in config                                                             | Allows custom/external plugins not distributed as npm packages. Override is optional and per-plugin instance. Default (no override) always uses npm resolution (L1). "Per-project plugin installation" is explicitly rejected as bad DX — users should not have to install plugins in each project.                 | 2026-08-17 |

## Known constraints (to incorporate in design)

1. **Path convention (v1 monorepo):** `plugins.<pluginId>.<implName>` maps to `packages/plugin-<pluginId>` package. The CLI resolves the manifest from that package via `createRequire(import.meta.url).resolve('plugin-<pluginId>/plugin.config.js')` (or `plugin.manifest.json` fallback). Plugins must be listed as dependencies of `flow-cli/package.json` for this to work.

2. **Security requirement (PLUGIN-002):** After loading the manifest, the CLI must assert that `manifest.pluginId === pluginId` (extracted from the type reference). If they differ: hard error, do not load the plugin.

3. **Implementation lookup:** After loading the manifest, the CLI looks up `manifest.implementations[extensionPoint][implName]`. If not found: hard error ("plugin `<pluginId>` does not provide implementation `<implName>` for extension point `<extensionPoint>`").

4. **Version check (PLUGIN-005):** The declared `version` integer is checked against the CLI's supported versions list from `extension-points.json`. If not supported: hard error.

5. **Provider instantiation:** For TS manifests, `impl.provider` is a factory function -- call it with the merged options to get the provider instance: `impl.provider(mergedOptions)`. Zero-option providers (e.g., `none`) use `() => provider` -- the CLI calls `impl.provider({})` and the factory ignores the argument. For JSON manifests, `require(impl.entrypoint)[impl.export]` is the factory -- validate it duck-types against the expected interface at this point (not deferred to first use, per P-4).

6. **`pluginsDir` override (Decision L2):** The config instance may declare a `pluginsDir` field (absolute path). When present, `PluginLoader` resolves the manifest from `path.join(pluginsDir, 'plugin-<id>', 'plugin.config.js')` instead of npm resolution. This supports custom/external plugins. Config format:
    ```yaml
    plugins:
        instances:
            my-custom:
                type: plugins.custom.default
                pluginsDir: /opt/flow-plugins # optional, absolute path
    ```
    `pluginsDir` must be an absolute path -- relative paths are a hard error.

## Design still needed

- The exact module resolution strategy for JSON manifests (entrypoint path normalization)
- The duck-type validation mechanism for JSON manifests at load time
- How provider instances are cached (singleton per instance name, or new instance per flow?)
- How the loading mechanism works outside the monorepo (v2: npm packages)
- **Planned:** Per-flow workspace override via a `plugins:` section in the flow YAML. Supports both `use:` (reference a named global instance) and `instance:` (inline instance — credentials must use `${ENV_VAR}`, same rule as project config). When present, the daemon resolves the workspace provider per-execution instead of using the global startup provider. When absent, falls back to the global provider. Implementation: inject a `resolveWorkspaceProvider(config?)` callback into `CommandHandler` from `Daemon.ts`; `handleRun()` calls it with `flow.plugins?.workspace` if present.

## Open questions for this module

- Instance singleton vs new-per-flow: should `my-worktree` be instantiated once at startup or per flow execution?
- Error recovery: if a plugin fails to load, should the CLI fail fast (P-4) or skip and warn?
  (P-4 suggests fail fast -- but worth documenting explicitly.)

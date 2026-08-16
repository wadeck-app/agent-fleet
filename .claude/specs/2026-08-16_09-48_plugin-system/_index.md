# Spec: Plugin System for flow/task CLI

**Created:** 2026-08-16
**Version:** v0.1
**Status:** In Progress -- v0.1 -- 7/10 questions resolved
**Iteration:** 1

## Summary

<!-- One paragraph: what this spec covers and why it exists. Fill in after first few decisions. -->

## Decision Log

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 1 | In-process plugins with explicit capability injection (Option C) | Accepted | 2026-08-16 | Simple to build, clean TypeScript interface contract, easy path to subprocess isolation later via host-side adapter wrapping. Plugins are developer-written, no malicious actor threat. |
| 2 | Config layers: global config (env var or ~/.flow/config.yml) + project config (use + overrides) | Accepted | 2026-08-16 | Project uses "use: plugins.<pluginId>.<implName>" to reference a named instance from global config, OR declares an inline instance directly. Global config defines named plugin instances with credentials via ${ENV_VAR}. FLOW_CONFIG / TASK_CONFIG env var overrides the default user-home path. Multiple instances of same type (e.g. 3 Jira) are supported. Cloud B global config file = v2. Remote config download = v3. |
| 3a | Hybrid manifest: plugin.config.ts (primary) + plugin.manifest.json (fallback) -- same schema | Accepted | 2026-08-16 | TS is type-safe and enables direct function refs validated at build time. JSON supports non-JS plugins and wrappers. Both follow the PluginManifest schema from @flow/plugin-sdk. |
| 3b | Plugin violation rules PLUGIN-001 to 008 defined in plugin-violation-rules.md | Accepted | 2026-08-16 | Enforced as local .violations/config.ts rules on all packages/plugin-* packages. |
| 3c | version field is a plain integer; no bijection with package version; @flow/extension-points exposes multiple interface versions simultaneously | Accepted | 2026-08-16 | Extension point name (manifest key) + version integer together identify the TypeScript interface. Plugin pins its import to the versioned path (e.g. extension-points/tasks/v1). Package version is independent. |
| 3d | Extension point interfaces live in dedicated package packages/extension-points (@flow/extension-points) | Accepted | 2026-08-16 | Decouples interface contract from CLI impl and plugin impl. CLI, plugins, and plugin-sdk all depend on it; none own it. |
| 3e | Extension point registry: extension-points.json (IDs, versions, status, descriptions) + hand-written TS interfaces. Nothing is generated. | Accepted | 2026-08-16 | JSON is read by PLUGIN-004/005 at lint time. TS interfaces are always hand-written -- JSON does not describe interface shape, only existence and version numbers. |

## Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| 1 | What is the plugin discovery and loading mechanism? | High | Open |
| - | **RESOLVED:** Plugin isolation model -- in-process with capability injection | - | Resolved |
| 2 | What is the plugin configuration format and location? | High | Open |
| 3 | What is the plugin interface contract (how does a plugin declare what it provides)? | High | Open |
| 4 | How are provider types (workspace, agent, model, etc.) registered and resolved? | High | Open |
| 5 | What is the lifecycle of a plugin (init, teardown, error handling)? | Medium | Open |
| 6 | What is the workspace provider interface and the "none" strategy? | High | Open |
| 7 | What is the worktree workspace provider strategy? | High | Open |
| 8 | How are secrets/credentials handled within plugins? | High | Open |
| 9 | What versioning/compatibility contract exists between the CLI and plugins? | Medium | Open |
| 10 | How is the user intervention/approval provider integrated? | Medium | Open |

## Modules / Sub-files

| File | Contents |
|---|---|
| `guiding-principles.md` | Core principles driving all decisions |
| `out-of-scope.md` | Explicitly excluded items |
| `threat-model.md` | Security threats and mitigations |
| `plugin-architecture.md` | Core plugin system design, config resolution, use/instance syntax |
| `plugin-manifest.md` | Manifest file format (plugin.config.ts + plugin.manifest.json) |
| `plugin-violation-rules.md` | Local violation rules for plugin-* packages (PLUGIN-001 to 008) |
| `workspace-provider.md` | Workspace provider plugin type |
| `provider-types.md` | Catalogue of all provider types |

## Changelog

| Version | Date | Summary |
|---|---|---|
| v0.1 | 2026-08-16 | Initial spec created |

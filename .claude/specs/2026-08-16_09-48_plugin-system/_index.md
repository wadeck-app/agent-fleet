# Spec: Plugin System for flow/task CLI

**Created:** 2026-08-16
**Version:** v0.1
**Status:** In Progress -- v0.1 -- 8/10 questions resolved
**Iteration:** 1

## Summary

This spec defines an extensible plugin system for the flow/task CLI. Plugins are in-process TypeScript modules that implement typed provider interfaces (extension points). Configuration is split across a global config file (named plugin instances with credentials) and a project config file (instance selection and project-specific overrides). Two extension points are fully specified for v1: `workspace` (none and worktree providers) and `approval` (CLI prompt and orchestrator web UI providers). The broader catalogue of extension points (agent, model, script, secrets, context) is defined in the registry but not yet fully designed.

## Decision Log

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 1 | In-process plugins with explicit capability injection (Option C) | Accepted | 2026-08-16 | Simple to build, clean TypeScript interface contract, easy path to subprocess isolation later via host-side adapter wrapping. Plugins are developer-written, no malicious actor threat. |
| 2 | Config layers: global config (env var or ~/.flow/config.yml) + project config (use + overrides) | Accepted | 2026-08-16 | Project uses "use: <instance-name>" (the key in global config instances:) to reference a named instance, OR declares an inline instance with "instance.type: plugins.<pluginId>.<implName>". Global config defines named plugin instances with credentials via ${ENV_VAR}. FLOW_CONFIG / TASK_CONFIG env var overrides the default user-home path. Multiple instances of same type (e.g. 3 Jira) are supported. Cloud B global config file = v2. Remote config download = v3. |
| 3a | Hybrid manifest: plugin.config.ts (primary) + plugin.manifest.json (fallback) -- same schema | Accepted | 2026-08-16 | TS is type-safe and enables direct function refs validated at build time. JSON supports non-JS plugins and wrappers. Both follow the PluginManifest schema from @flow/plugin-sdk. |
| 3b | Plugin violation rules PLUGIN-001 to 008 defined in plugin-violation-rules.md | Accepted | 2026-08-16 | Enforced as local .violations/config.ts rules on all packages/plugin-* packages. |
| 3c | version field is a plain integer; no bijection with package version; @flow/extension-points exposes multiple interface versions simultaneously | Accepted | 2026-08-16 | Extension point name (manifest key) + version integer together identify the TypeScript interface. Plugin pins its import to the versioned path (e.g. extension-points/tasks/v1). Package version is independent. |
| 3d | Extension point interfaces live in dedicated package packages/extension-points (@flow/extension-points) | Accepted | 2026-08-16 | Decouples interface contract from CLI impl and plugin impl. CLI, plugins, and plugin-sdk all depend on it; none own it. |
| 3e | Extension point registry: extension-points.json (IDs, versions, status, descriptions) + hand-written TS interfaces. Nothing is generated. | Accepted | 2026-08-16 | JSON is read by PLUGIN-004/005 at lint time. TS interfaces are always hand-written -- JSON does not describe interface shape, only existence and version numbers. |
| 4 | WorkspaceProvider: allocate/release lifecycle. none = no-op. worktree = git worktree add/remove. branchStrategy: new-branch only in v1. | Accepted | 2026-08-16 | Lifecycle model needed for cleanup. none trivially implements it. Existing workspace.mode/gitStrategy/reusePolicy fields removed from flow YAML. |
| 5 | ApprovalProvider: 3 methods (requestInput/requestChoice/requestApproval). cli plugin = terminal prompt. orchestrator plugin = web backend API. | Accepted | 2026-08-16 | Typed methods cleaner than discriminated union. StepRunner/FlowOrchestrator/ToolCallInjector must be adjusted to inject and use the provider. |
| 6 | Secrets model: ${ENV_VAR} interpolation in options: for plugin auth credentials; secrets extension point is for runtime injection into flows (not plugin auth) | Accepted | 2026-08-16 | Clarifies the boundary between plugin connection auth and flow-level secret injection. Prevents future conflict between the two models. |

## Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| 1 | What is the plugin discovery and loading mechanism? (how does CLI go from type string to loaded module) | High | Open |
| 2 | What is the plugin configuration format and location? | High | Resolved (Decision 2) |
| 3 | What is the plugin interface contract (how does a plugin declare what it provides)? | High | Resolved (Decisions 3a-3e) |
| 4 | How are provider types (workspace, agent, model, etc.) registered and resolved? | High | Partially resolved (Decisions 3d-3e cover registration; loading/resolution still open -- linked to Q1) |
| 5 | What is the lifecycle of a plugin (init, teardown, error handling)? | Medium | Open |
| 6 | What is the workspace provider interface and the "none" strategy? | High | Resolved (Decision 4) |
| 7 | What is the worktree workspace provider strategy? | High | Resolved (Decision 4) |
| 8 | How are secrets/credentials handled within plugins? | High | Resolved (Decision 6): ${ENV_VAR} for plugin auth; secrets extension point for runtime flow injection. Two complementary models, not conflicting. |
| 9 | What versioning/compatibility contract exists between the CLI and plugins? | Medium | Partially resolved (Decisions 3c-3e); loading mechanism still open (Q1) |
| 10 | How is the user intervention/approval provider integrated? | Medium | Resolved (Decision 5) |
| 11 | What is the transport mechanism for the orchestrator approval plugin (polling vs WebSocket/SSE)? | High | Open -- must be decided before orchestrator plugin implementation |
| 12 | What is the minimal authorization check required for the orchestrator approval plugin before it can ship? (T-06 gate) | High | Open -- orchestrator approval plugin must not ship until resolved |

## Modules / Sub-files

| File | Contents |
|---|---|
| `guiding-principles.md` | Core principles driving all decisions |
| `out-of-scope.md` | Explicitly excluded items |
| `threat-model.md` | Security threats and mitigations |
| `plugin-architecture.md` | Core plugin system design, config resolution, use/instance syntax |
| `plugin-manifest.md` | Manifest file format (plugin.config.ts + plugin.manifest.json) |
| `plugin-violation-rules.md` | Local violation rules for plugin-* packages (PLUGIN-001 to 008) |
| `extension-points.md` | Extension point registry (extension-points.json) and versioning rules |
| `workspace-provider.md` | workspace extension point -- none and worktree implementations |
| `approval-provider.md` | approval extension point -- cli and orchestrator implementations, code adjustments |
| `provider-types.md` | Catalogue of all provider types (remaining: agent, model, script, secrets, context) |
| `plugin-loading.md` | Plugin type-reference-to-provider resolution mechanism (Open Q1 stub) |

## Changelog

| Version | Date | Summary |
|---|---|---|
| v0.1 | 2026-08-16 | Initial spec created |

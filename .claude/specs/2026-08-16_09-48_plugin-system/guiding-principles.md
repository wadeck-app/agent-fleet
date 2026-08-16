# Guiding Principles -- Plugin System for flow/task CLI

These principles take priority in every design decision.
Any option that conflicts with a principle must be raised as an open question -- never silently accepted.

## Principles

### P-1: Start simple, wrap later

Plugins run in-process with explicit capability injection; process-level isolation is a future concern, not a v1 requirement.
**Why:** Plugins are written by the developer running the tool -- no malicious actor threat exists at this stage. Adding subprocess IPC now would add complexity with no security benefit. The TypeScript interface contract ensures that a future host-side wrapper can add isolation without touching plugin code.

### P-2: Explicit capability injection

Plugins never receive the full CLI context; the host injects only the typed request object the plugin needs for each call.
**Why:** Reduces accidental data leakage between plugins (e.g., a workspace plugin has no business seeing secrets config). Also makes the plugin API surface explicit and documentable.

### P-3: Global config is the single source of plugin instances; projects only select and override

Global config (user-home or FLOW_CONFIG/TASK_CONFIG env var target) defines which plugins exist and how to connect to them. Project config only says "use this type" and provides project-specific non-sensitive params.
**Why:** Credentials must never live in project config (committed to git). Centralizing instance definitions makes it easy for a hosted server or CI environment to inject a different global config without touching project files.

### P-4: Fail loudly, no silent fallback

Missing env vars, unknown plugin types, unresolved `use:` references, and missing FLOW_CONFIG target files are hard errors at config load time.
**Why:** Silent fallbacks (empty string for a missing token, wrong plugin type used silently) create invisible failures that are very hard to debug in CI or hosted environments.

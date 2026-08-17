# Plugin Architecture -- Plugin System for flow/task CLI

**Version:** v0.2
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

Plugins provide feature implementations (workspace, tasks, agents, secrets, etc.) to the flow/task CLI.
This module covers: config resolution, plugin loading, and the project config "use + override" model.
It does NOT cover individual plugin type contracts (see provider-types.md).

## Decisions

| #   | Decision                                                                      | Rationale                                            | Date       |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------- | ---------- |
| 1   | In-process, capability-injection model                                        | Simple, no IPC, TypeScript interface IS the contract | 2026-08-16 |
| 2   | Global config defines named instances; project uses "use:" or inline instance | See design section below                             | 2026-08-16 |

## Design

### Config resolution order (v1)

```
Priority (highest to lowest):

1. FLOW_CONFIG env var (or TASK_CONFIG for task CLI)
   If set: load the file at that path as the global config
   If set but the file does not exist at that path: hard error at startup (P-4) -- no fallback to user-home
   If not set: load ~/.flow/config.yml (or ~/.task/config.yml for task CLI)
   If that file is also missing: global config is empty (no named instances available)

2. Project config: <project-root>/.flow/config.yml
   Loaded on top of global config.
   Each plugin feature section is independent (no deep merge -- section-level replace + options shallow merge).
```

**Same env var pattern for both CLIs -- consistent by design:**

- flow CLI: `FLOW_CONFIG` -> `~/.flow/config.yml`
- task CLI: `TASK_CONFIG` -> `~/.task/config.yml`

### Global config structure (v1)

Defines named plugin instances. An instance = a plugin type + its connection/auth config.
Multiple instances of the same type are supported and named independently.

The `type:` field in global config instances uses the full plugin-implementation reference:
`plugins.<pluginId>.<implName>` (e.g. `plugins.worktree.default`).

The project config `use:` field uses the **instance name** (the user-chosen key in the global
config `instances:` block, e.g. `my-worktree` or `jira-work`) -- NOT the type path.
These are two distinct namespaces: `type:` identifies what a plugin IS; `use:` selects which
named instance to use.

Instances may optionally declare `pluginsDir` (absolute path) to load the plugin from a custom location instead of `flow-cli`'s npm dependencies. See plugin-loading.md Decision L2.

```yaml
# ~/.flow/config.yml  (or file pointed to by FLOW_CONFIG)
# NEVER commit this file. Credentials use ${ENV_VAR} interpolation only.

plugins:
    instances:
        my-worktree:
            type: plugins.worktree.default
            options:
                baseDir: ~/workspaces

        jira-work:
            type: plugins.jira.public
            options:
                host: work.atlassian.net
                token: ${JIRA_WORK_TOKEN}

        jira-oss:
            type: plugins.jira.public
            options:
                host: oss.atlassian.net
                token: ${JIRA_OSS_TOKEN}

        jira-personal:
            type: plugins.jira.public
            options:
                host: personal.atlassian.net
                token: ${JIRA_PERSONAL_TOKEN}

        local-secrets:
            type: plugins.local.default

        # Custom plugin not distributed via npm - use pluginsDir to point to its location
        custom-workspace:
            type: plugins.custom.default
            pluginsDir: /opt/flow-plugins # absolute path; must contain plugin-custom/plugin.config.js
            options:
                baseDir: ~/workspaces
```

### Project config structure (v1)

Safe to commit. Zero credentials. Two syntaxes for each feature section:

**Syntax 1 -- reference (`use:`):** references a named instance from the global config.
Project provides only project-specific override options (non-sensitive).
`use:` takes the **instance name** as defined in the global config `instances:` block.

```yaml
# <project>/.flow/config.yml  -- reference syntax (normal dev workflow)
plugins:
    workspace:
        use: my-worktree # instance name from global config
        options:
            prefix: myproject- # project-specific override

    tasks:
        use: jira-work # selects which Jira instance (could be jira-oss, jira-personal, etc.)
        options:
            project: MYPROJ

    secrets:
        use: local-secrets # instance name from global config
```

**Syntax 2 -- inline instance:** defines the instance directly in the project config.
Credentials MUST use `${ENV_VAR}` -- any literal credential value is a hard error at load time.
Used when no global config is available (CI environment without user-home).

```yaml
# <project>/.flow/config.yml  -- inline syntax (CI / no user-home)
plugins:
    workspace:
        instance:
            type: plugins.worktree.default
            options:
                baseDir: ${WORKSPACE_DIR}
        options:
            prefix: myproject-

    tasks:
        instance:
            type: plugins.jira.public
            options:
                host: ${JIRA_HOST}
                token: ${JIRA_TOKEN}
        options:
            project: MYPROJ
```

Both syntaxes can coexist in the same project config (one feature uses `use:`, another uses `instance:`).

### Merge semantics

- Each feature section (`workspace`, `tasks`, `secrets`, ...) is resolved independently.
- If `use:` is present: look up the **instance name** in the global config `instances:` map. If the name is not found: hard error at startup (P-4). Then shallow-merge the project `options:` on top of the instance's options.
- If `instance:` is present: use it directly, then shallow-merge the project `options:` on top. Global config is not consulted for this section.
- If neither `use:` nor `instance:` is present for a feature: the behavior depends on whether the feature is **required** or **optional**:
    - **Required features** (workspace only in v1): hard error at startup if not configured.
    - **Optional features** (tasks, secrets, approval): error only when the feature is first invoked at runtime. If a flow never uses tasks or secrets, a missing provider is not a startup error.
      Note: `tasks` and `secrets` will become required once stable implementations ship and are documented as such.
- If both `use:` and `instance:` are present in the same feature section: hard error at config load time (P-4). A feature section must declare exactly one of the two syntaxes.
- Options precedence within Syntax 2: if both `instance.options` and the section-level `options:` define the same key, the section-level `options:` wins (it is the project-specific override).

### Credential validation rules

Enforced at config load time (hard errors, no silent fallback -- P-4):

1. `${ENV_VAR}` is resolved from `process.env`. If the variable is missing: error with variable name.
2. In **all option layers** (global config `instance.options`, project config `instance.options`, and project config section-level `options:`): any option value that is a non-interpolated string AND matches a known sensitive field is a hard error. This applies to both Syntax 1 (`use:` + `options:`) and Syntax 2 (`instance:` + `options:`). A developer cannot bypass the check by placing a literal credential in the section-level `options:` of a committed project config. Known sensitive field list is defined centrally in `@flow/plugin-sdk/src/sensitiveFields.ts` (baseline: `token`, `password`, `secret`, `key`, `apiKey`, `privateKey`, `accessToken`, `bearerToken`). Plugins may extend this list via `sensitiveFields` in their manifest but may not remove baseline entries.
3. In global config: same rules apply. Global config is also not committed, but defensive validation is still enforced.

**Ordering note:** Plugin-specific `sensitiveFields` extensions (declared in the manifest) cannot be applied during config load time credential validation, because loading the manifest requires the config to already be resolved. Plugin-specific sensitive fields are therefore enforced only by the PLUGIN-007 manifest lint rule. Plugin authors should use baseline field names (`token`, `password`, etc.) where possible. Critical non-baseline fields should be proposed for addition to the baseline in `@flow/plugin-sdk/src/sensitiveFields.ts` rather than relying solely on per-plugin extensions.

---

## v2 TODO (documented, not designed)

### Cloud B: CI/hosted global config file

A CI environment or hosted server may provide a global config file with named instances
(credentials injected via the CI secrets system as `${ENV_VAR}`).
The `FLOW_CONFIG` / `TASK_CONFIG` env var already supports this -- pointing it at a file
committed to the CI repo (but not the project repo) is the intended v2 pattern.

No additional design needed in the CLI -- `FLOW_CONFIG` already handles it.
The v2 work is: documentation, a `flow config validate` command to verify the file, and
possibly a `flow config init --ci` scaffold command.

### Remote config download (v3)

A hosted server or team config can live at a remote URL. The CLI would:

1. Download and cache the remote config locally (TTL-based)
2. Use it as the global layer (same position as FLOW_CONFIG / user-home file)
3. Support a `FLOW_CONFIG_REMOTE` env var or a `remote:` key in user-home config

Design deferred. Introduces new STRIDE surface (Spoofing/Tampering of remote config) -- threat model update required at that point.

### Plugin input/placeholder schema (v3+)

The global config could declare required "inputs" that a project config must supply
to finalize an instance (e.g., the global jira instance requires `project` to be set).
This enforces patterns from the global config onto projects without them needing to know
the full config structure.

Design deferred. Tag: plugin-inputs-v3.

---

## Security considerations

- T-01 (Information Disclosure): credentials in global config and inline instances must use `${ENV_VAR}` -- enforced at parse time. Literal credential values in known sensitive fields are a hard error.
- T-01 note: project config is committed to git. The `instance:` inline syntax combined with the credential validation rule ensures no token can be accidentally committed.
- Remote config (v3): introduces Spoofing/Tampering threats on the remote config source -- deferred to v3 threat model update.

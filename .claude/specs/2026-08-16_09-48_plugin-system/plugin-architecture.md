# Plugin Architecture -- Plugin System for flow/task CLI

**Version:** v0.2
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

Plugins provide feature implementations (workspace, tasks, agents, secrets, etc.) to the flow/task CLI.
This module covers: config resolution, plugin loading, and the project config "use + override" model.
It does NOT cover individual plugin type contracts (see provider-types.md).

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 1 | In-process, capability-injection model | Simple, no IPC, TypeScript interface IS the contract | 2026-08-16 |
| 2 | Global config defines named instances; project uses "use:" or inline instance | See design section below | 2026-08-16 |

## Design

### Config resolution order (v1)

```
Priority (highest to lowest):

1. FLOW_CONFIG env var (or TASK_CONFIG for task CLI)
   If set: load the file at that path as the global config
   If not set: load ~/.flow/config.yml (or ~/.task/config.yml for task CLI)
   If that file is also missing: global config is empty (no named instances available)

2. Project config: <project-root>/.flow/config.yml
   Loaded on top of global config.
   Each plugin feature section is independent (no deep merge -- section-level replace + options shallow merge).
```

**Same env var pattern for both CLIs -- consistent by design:**
- flow CLI:  `FLOW_CONFIG`  -> `~/.flow/config.yml`
- task CLI:  `TASK_CONFIG`  -> `~/.task/config.yml`

### Global config structure (v1)

Defines named plugin instances. An instance = a plugin type + its connection/auth config.
Multiple instances of the same type are supported and named independently.

```yaml
# ~/.flow/config.yml  (or file pointed to by FLOW_CONFIG)
# NEVER commit this file. Credentials use ${ENV_VAR} interpolation only.

plugins:
  instances:
    my-worktree:
      type: worktree
      options:
        baseDir: ~/workspaces

    jira-work:
      type: jira
      options:
        host: work.atlassian.net
        token: ${JIRA_WORK_TOKEN}

    jira-oss:
      type: jira
      options:
        host: oss.atlassian.net
        token: ${JIRA_OSS_TOKEN}

    jira-personal:
      type: jira
      options:
        host: personal.atlassian.net
        token: ${JIRA_PERSONAL_TOKEN}

    local-secrets:
      type: local
```

### Project config structure (v1)

Safe to commit. Zero credentials. Two syntaxes for each feature section:

**Syntax 1 -- reference (`use:`):** references a named instance from the global config.
Project provides only project-specific override options (non-sensitive).

```yaml
# <project>/.flow/config.yml  -- reference syntax (normal dev workflow)
plugins:
  workspace:
    use: my-worktree          # must match an instance name in global config
    options:
      prefix: myproject-      # project-specific override, merged on top

  tasks:
    use: jira-work
    options:
      project: MYPROJ         # which Jira project -- not sensitive

  secrets:
    use: local-secrets
```

**Syntax 2 -- inline instance:** defines the instance directly in the project config.
Credentials MUST use `${ENV_VAR}` -- any literal credential value is a hard error at load time.
Used when no global config is available (CI environment without user-home).

```yaml
# <project>/.flow/config.yml  -- inline syntax (CI / no user-home)
plugins:
  workspace:
    instance:
      type: worktree
      options:
        baseDir: ${WORKSPACE_DIR}     # env var -- mandatory for any path/credential
    options:
      prefix: myproject-              # project-specific, not sensitive

  tasks:
    instance:
      type: jira
      options:
        host: ${JIRA_HOST}
        token: ${JIRA_TOKEN}
    options:
      project: MYPROJ
```

Both syntaxes can coexist in the same project config (one feature uses `use:`, another uses `instance:`).

### Merge semantics

- Each feature section (`workspace`, `tasks`, `secrets`, ...) is resolved independently.
- If `use:` is present: load the named instance from global config, then shallow-merge the project `options:` on top.
- If `instance:` is present: use it directly, then shallow-merge the project `options:` on top. Global config is not consulted for this section.
- If neither `use:` nor `instance:` is present for a feature: the global config's first matching instance for that feature type is used as-is (future: may require explicit opt-in -- TBD).

### Credential validation rules

Enforced at config load time (hard errors, no silent fallback -- P-4):

1. `${ENV_VAR}` is resolved from `process.env`. If the variable is missing: error with variable name.
2. In inline instances, any option value that is a non-interpolated string AND matches a known sensitive field (token, password, secret, key, apiKey): hard error. Known sensitive field list is maintained per plugin type.
3. In global config: same rules apply. Global config is also not committed, but defensive validation is still enforced.

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
- T-02 (Tampering): project config is committed to git. The `instance:` inline syntax combined with the credential validation rule ensures no token can be accidentally committed.
- Remote config (v3): introduces Spoofing/Tampering threats on the remote config source -- deferred to v3 threat model update.

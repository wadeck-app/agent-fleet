# Plugin Manifest -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

Every plugin must declare its identity and its implementations via a manifest file.
The manifest is the single source of truth for what a plugin provides and how to load it.
It does NOT contain credentials or runtime config -- those live in the global/project config.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 3a | Hybrid manifest: plugin.config.ts (primary) OR plugin.manifest.json (fallback) | TS is type-safe and enables direct function refs; JSON supports non-JS plugins and wrapped/remote plugins. Both must follow the same schema. | 2026-08-16 |

## Manifest file resolution

The CLI looks for, in order:
1. `plugin.config.ts` (compiled to `plugin.config.js` in `dist/`) -- primary
2. `plugin.manifest.json` at package root -- fallback (non-JS plugins, wrappers)

Both files must satisfy the same `PluginManifest` schema (defined in `@flow/plugin-sdk`).
If neither is found, the plugin fails to load with an explicit error.

## PluginManifest schema

```typescript
// @flow/plugin-sdk -- PluginManifest type (versioned)
interface PluginManifest {
  pluginId: string;              // must match "plugin-<pluginId>" package name
  manifestVersion: "1";          // bumped when the schema itself changes
  implementations: {
    [extensionPoint: string]: {  // e.g. "workspace", "tasks", "secrets"
      [implName: string]: PluginImplementation;  // e.g. "public", "private", "default"
    };
  };
}

interface PluginImplementation {
  interfaceVersion: string;      // e.g. "workspace@1", "tasks@2" -- see versioning
  // TS manifest only:
  provider?: () => unknown;      // direct function reference (validated at build time)
  // JSON manifest only (or TS fallback):
  entrypoint?: string;           // relative path to compiled JS file, e.g. "./dist/public.js"
  export?: string;               // named export to use, e.g. "taskProvider"
}
```

## plugin.config.ts example (TypeScript -- primary)

```typescript
// packages/plugin-jira/plugin.config.ts
import type { PluginManifest } from "@flow/plugin-sdk";
import { publicTaskProvider } from "./src/PublicTaskProvider";
import { privateTaskProvider } from "./src/PrivateTaskProvider";

export const manifest: PluginManifest = {
  pluginId: "jira",
  manifestVersion: "1",
  implementations: {
    tasks: {
      public:  { interfaceVersion: "tasks@1", provider: publicTaskProvider },
      private: { interfaceVersion: "tasks@1", provider: privateTaskProvider },
    }
  }
};
```

TypeScript enforces that `publicTaskProvider` satisfies the `TaskProvider` interface for `tasks@1`
at build time. No runtime validation needed for the `provider` field.

## plugin.manifest.json example (JSON -- non-JS plugins and wrappers)

```json
{
  "pluginId": "jira",
  "manifestVersion": "1",
  "implementations": {
    "tasks": {
      "public": {
        "interfaceVersion": "tasks@1",
        "entrypoint": "./dist/public.js",
        "export": "taskProvider"
      },
      "private": {
        "interfaceVersion": "tasks@1",
        "entrypoint": "./dist/private.js",
        "export": "taskProvider"
      }
    }
  }
}
```

For JSON manifests, runtime validation against the interface is performed at first use (not at load time).

## Naming convention in config

A plugin implementation is referenced in config as:
```
plugins.<pluginId>.<implementationName>
```
Examples:
- `plugins.jira.public`
- `plugins.jira.private`
- `plugins.worktree.default`
- `plugins.local.default`

## Open questions

- 3b: Versioning scheme for interfaces -- how is a mismatch between `interfaceVersion` and CLI handled? (next)
- 3c: Extension point registry -- who defines the valid extension point IDs and their interface types?

## Security considerations

- No credentials or sensitive values are allowed in the manifest -- it describes code, not runtime config.
- JSON entrypoint paths must be relative to the package root and must not traverse outside it (`../` is rejected).
- `provider` function references in TS manifests are validated at TypeScript build time -- no additional runtime check needed.

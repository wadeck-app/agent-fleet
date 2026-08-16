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
// @flow/plugin-sdk -- PluginManifest type
interface PluginManifest {
  pluginId: string;              // must match "plugin-<pluginId>" package name
  manifestVersion: "1";          // bumped when the manifest schema itself changes (rare)
  implementations: {
    [extensionPoint: string]: {  // e.g. "workspace", "tasks", "secrets"
      [implName: string]: PluginImplementation;  // e.g. "public", "private", "default"
    };
  };
}

interface PluginImplementation {
  version: number;               // interface version: 1, 2, 3...
                                 // determines which TypeScript type from @flow/extension-points applies
  // TS manifest only:
  provider?: unknown;            // direct function reference -- TypeScript validates at build time
                                 // against the imported type from @flow/extension-points
  // JSON manifest only (or TS fallback):
  entrypoint?: string;           // relative path to compiled JS, e.g. "./dist/public.js"
  export?: string;               // named export, e.g. "taskProvider"
}
```

**Version encoding rationale:**
- `version` is a plain integer -- no string parsing, no combined `"tasks@1"` format.
- The extension point is already known from its position as the parent key in `implementations`.
- Extension point name + version together identify the exact TypeScript interface to use.

**How version ties build-time to runtime:**
- Build time: plugin imports the specific versioned type from `@flow/extension-points`:
  ```typescript
  import type { TaskProvider } from "@flow/extension-points/tasks/v1";
  ```
  TypeScript enforces the contract at compile time.
- Runtime: CLI reads `version: 1` from the manifest and selects the matching adapter/validator internally.
- **No bijection between package version and interface version.** A single release of `@flow/extension-points` can expose v1 AND v2 of the same extension point simultaneously. A plugin pins its import to the version it was written against; the package version is irrelevant. Enforced by PLUGIN-005 (version declared in manifest must be a version the CLI knows how to handle).

## Extension points package

Extension point interfaces live in a dedicated package: **`packages/extension-points`** (published as `@flow/extension-points`).

**Why a dedicated package:**
- Separates the interface contract from both the CLI implementation and the plugin implementations.
- The CLI, the plugin-sdk, and all plugins depend on `@flow/extension-points` -- none of them own it.
- Package version and interface versions are independent: bumping the package does not imply bumping an interface version, and a new interface version can be added without breaking existing ones.

**Package structure:**
```
packages/extension-points/
  extension-points.json   -- canonical registry: IDs, descriptions, supported versions, status
  README.md               -- generated or hand-written doc for each extension point
  src/
    workspace/
      v1.ts     -- hand-written: export interface WorkspaceProvider { ... }
      v2.ts     -- hand-written: added later, v1 still present and supported
    tasks/
      v1.ts     -- hand-written interface
    secrets/
      v1.ts
    agents/
      v1.ts
    models/
      v1.ts
    scripts/
      v1.ts
    approvals/
      v1.ts
  index.ts      -- re-exports LATEST version of each extension point as convenience default
```

**What is and is NOT generated from `extension-points.json`:**
- The JSON registry is the source of truth for: valid extension point IDs, supported version numbers per ID, descriptions, status (stable/deprecated).
- PLUGIN-004 reads this JSON at lint time to validate that a plugin manifest only references known IDs and known versions.
- The `ExtensionPointId` union type (`"workspace" | "tasks" | ...`) can optionally be generated from the JSON -- but it is just a list of strings and can equally be written by hand in sync.
- **The TypeScript interfaces themselves (`WorkspaceProvider`, `TaskProvider`, etc.) are ALWAYS hand-written.** They are never generated. The JSON does not describe the interface shape -- only its existence and version numbers.

**Import convention for plugin authors:**
```typescript
// Pin to a specific version (recommended for plugins):
import type { TaskProvider } from "@flow/extension-points/tasks/v1";

// Or use the latest (risky -- may break on package update):
import type { TaskProvider } from "@flow/extension-points";
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

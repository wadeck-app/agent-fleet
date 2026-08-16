# Extension Points Registry -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

`packages/extension-points` is the canonical source of truth for:
- Which extension point IDs exist
- Which interface versions each one supports
- What each one is responsible for

The TypeScript interfaces for each extension point are hand-written in versioned files.
The `extension-points.json` file is the machine-readable registry used by PLUGIN-004 validation.

## extension-points.json structure

```json
{
  "extensionPoints": [
    {
      "id": "workspace",
      "status": "stable",
      "description": "Provides and manages isolated workspaces for task execution",
      "versions": [
        { "version": 1, "status": "stable", "since": "0.1.0" }
      ]
    },
    {
      "id": "tasks",
      "status": "stable",
      "description": "Provides and manages tasks/tickets (filesystem, Jira, GitHub Issues, etc.)",
      "versions": [
        { "version": 1, "status": "stable", "since": "0.1.0" }
      ]
    },
    {
      "id": "secrets",
      "status": "stable",
      "description": "Resolves secret values at runtime (local keychain, Vault, env vars, etc.)",
      "versions": [
        { "version": 1, "status": "stable", "since": "0.1.0" }
      ]
    },
    {
      "id": "agent",
      "status": "stable",
      "description": "Provides agent execution strategies (Claude CLI, OpenAI, custom, etc.)",
      "versions": [
        { "version": 1, "status": "stable", "since": "0.1.0" }
      ]
    },
    {
      "id": "model",
      "status": "stable",
      "description": "Provides LLM model access (Anthropic, OpenAI, Google, etc.)",
      "versions": [
        { "version": 1, "status": "stable", "since": "0.1.0" }
      ]
    },
    {
      "id": "script",
      "status": "stable",
      "description": "Provides script execution environments (inline bash, Docker, Lambda, etc.)",
      "versions": [
        { "version": 1, "status": "stable", "since": "0.1.0" }
      ]
    },
    {
      "id": "approval",
      "status": "stable",
      "description": "Provides user intervention and approval flows (CLI prompt, web UI, Slack, etc.)",
      "versions": [
        { "version": 1, "status": "stable", "since": "0.1.0" }
      ]
    }
  ]
}
```

## What lives where

| Concern | Location | Who writes it |
|---|---|---|
| Valid extension point IDs + versions | `extension-points.json` | Hand-written, owned by CLI team |
| TypeScript interface per version | `src/<id>/v<N>.ts` | Hand-written, never generated |
| Convenience re-export (latest) | `src/index.ts` | Hand-written |
| Validation at lint time (PLUGIN-004/005) | `.violations/config.ts` in monorepo | Reads the JSON at lint time |
| Documentation / examples | Per-extension-point README in `src/<id>/` | Hand-written |

## Interface versioning rules

When an existing interface needs a breaking change:
1. Add `src/<id>/v<N+1>.ts` with the new interface -- do NOT modify the existing file.
2. Add the new version entry to `extension-points.json` with `status: "stable"`.
3. Mark the old version as `"status": "deprecated"` in the JSON with a `"deprecatedSince"` field.
4. Add an internal adapter in the CLI if it needs to support both versions simultaneously.
5. Update PLUGIN-005 to include the new version and keep the deprecated one for the transition window.

When a version is removed (end of transition window):
1. Remove the version entry from `extension-points.json`.
2. Keep the `.ts` file in `src/<id>/` with a deprecation comment pointing to the new version -- do NOT delete it immediately (plugins may still reference the file until they migrate).
3. PLUGIN-005 will now reject manifests declaring the removed version.

## Open questions

- 3c: RESOLVED -- Option B (JSON registry, hand-written TS interfaces)

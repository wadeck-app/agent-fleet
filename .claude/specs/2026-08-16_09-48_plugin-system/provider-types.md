# Provider Types Catalogue -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Stub -- extension points registered, interfaces not yet designed

## Overview

This file catalogues all registered extension points and their design status.
Fully designed extension points have their own spec files.
Stubs here represent registered IDs in `extension-points.json` pending full design.

## Fully designed extension points

| ID | Spec file | Status |
|---|---|---|
| `workspace` | workspace-provider.md | Approved -- v1 |
| `approval` | approval-provider.md | v1 (CLI plugin ready; orchestrator plugin has T-06 auth dependency -- see approval-provider.md § Security considerations) |
| `tasks` | (no dedicated spec file -- TaskProvider interface not yet captured in spec) | Registered as `planned` in extension-points.json (no versions, no interface yet) -- interface spec TODO before implementation |

Note: `tasks` is registered as `planned` (not stable) in `extension-points.json` -- no versions defined, no `v1.ts` yet. A `tasks-provider.md` must be created and the status changed to `stable` before implementing any tasks plugin.

## Stub extension points (registered as `"status": "planned"` in extension-points.json -- interfaces not yet designed, not safe to implement against)

### `agent`
**Purpose:** Provides agent execution strategies (Claude CLI, OpenAI API, custom subprocess, etc.)
**Status:** Registered in extension-points.json. Interface design deferred.
**Known future implementations:** claude-cli, openai-api, mock (for testing)

### `model`
**Purpose:** Provides LLM model access and configuration (Anthropic, OpenAI, Google, local models).
**Status:** Registered. Interface design deferred.
**Note:** May overlap with `agent` -- to be resolved when designed.

### `script`
**Purpose:** Provides script execution environments (inline bash, Docker container, AWS Lambda, etc.)
**Status:** Registered. Interface design deferred.
**Known future implementations:** bash-inline, docker, lambda

### `secrets`
**Purpose:** Resolves secret values at runtime (local keychain, HashiCorp Vault, AWS Secrets Manager, env vars).
**Status:** Registered. Interface design deferred.
**Note:** Related to Open Question #8 (secrets/credentials handling within plugins).

### `context`
**Purpose:** Provides and filters context management (storage, retrieval, filtering for agent prompts).
**Status:** Registered as planned. Interface design deferred.
**Security note:** Context data may contain sensitive information (secrets, PII, source code). Interface design must address data scoping and access controls before this point can be marked stable. Related to T-02.

## Next to design

Recommended priority order based on implementation dependency:
1. `secrets` -- required before `agent` and `model` can be fully configured
2. `agent` -- core execution primitive
3. `model` -- parameterizes `agent`
4. `script` -- parallel to `agent` for non-LLM steps
5. `context` -- enhancement, not a blocker

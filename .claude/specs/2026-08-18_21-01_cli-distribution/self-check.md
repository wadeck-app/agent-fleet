# Self-Check Suite -- CLI Distribution

**Version:** v0.1
**Last updated:** 2026-08-19
**Status:** Draft

## Overview

`flow cli self-check` runs 8 health checks after an auto-update to verify the new bundle is functional.
No real API calls, no side effects outside OS temp dir. Target: < 500ms total.
Exit code 0 if all pass, 1 if any fail.
Respects `FLOW_SELF_CHECK_QUIET=1` env var (suppress output, used internally by updater).

## Checks

### 1. Bundle integrity
**What:** Import FlowExecutor from the bundle's core module.
**Mock:** None required.
**Pass condition:** `import { FlowExecutor } from '../executor/FlowExecutor.js'` does not throw.
**Fail example:** SyntaxError or module-not-found during import (broken bundle).

### 2. Config loading
**What:** Load FlowConfig from an empty temp directory (no config file present -- tests defaults).
**Mock:** None. Use `os.tmpdir()` as cwd.
**Pass condition:** `FlowConfig.load(os.tmpdir())` returns an object with `workspace.retainDays` defined.
**Fail example:** FlowConfig throws on missing file instead of returning defaults.

### 3. YAML flow parsing
**What:** Parse a minimal inline flow definition string.
**Mock:** None.
**Input:**
```yaml
id: self-check-test
steps:
  - id: step1
    type: script
    script: echo ok
```
**Pass condition:** Parser returns an object with `id === 'self-check-test'` and `steps.length === 1`.
**Fail example:** Parser throws or returns undefined.

### 4. StepRunner init
**What:** Instantiate StepRunner with a minimal mock executor.
**Mock:**
```ts
const mockExecutor = { execute: (_step: unknown) => Promise.resolve({ output: 'ok', exitCode: 0 }) };
```
**Pass condition:** `new StepRunner({ executor: mockExecutor })` does not throw.
**Fail example:** Constructor throws due to missing required config field.

### 5. Plugin system (manifest-only)
**What:** Load the plugin registry in manifest-only mode (no activation).
**Mock:** None -- reads actual plugin manifests from the bundle.
**Pass condition:** `PluginRegistry.load({ manifestOnly: true })` returns without throw. Count of loaded manifests >= 0.
**Fail example:** PluginRegistry throws on malformed manifest.
**Note:** `manifestOnly: true` must be added to `PluginRegistry.load()` signature before this check can be implemented. Without it, self-check activates plugins with potential side effects.

### 6. TaskStore (temp dir)
**What:** Create, read, and delete a task in an isolated temp directory.
**Mock:** None. Uses `fs.mkdtempSync('flow-self-check-')`.
**Pass condition:** `store.create('test task')` returns a task; `store.findByPrefix(task.id.slice(0, 4))` returns the same task; no throw.
**Cleanup:** Delete temp dir after check regardless of pass/fail.
**Fail example:** TaskStore throws or returns wrong data.

### 7. HookDispatcher
**What:** Instantiate with empty config and dispatch a no-op event.
**Mock:** None.
**Pass condition:** `new HookDispatcher({})` constructs without error; `await dispatcher.dispatch('onTaskCreated', { taskId: 'test' }, () => {})` resolves without throw.
**Fail example:** Constructor throws on empty config; dispatch rejects.

### 8. Workspace config schema
**What:** Verify FlowConfig returns valid workspace cleanup defaults.
**Mock:** None. Uses `FlowConfig.load(os.tmpdir())`.
**Pass condition:** `config.workspace.retainDays` is a positive number; `config.workspace.maxWorkspaces` is a positive number.
**Fail example:** Fields are undefined or NaN (schema validation regression).

## Output format

```
[ok] Bundle integrity
[ok] Config loading
[ok] YAML flow parsing
[ok] StepRunner init
[ok] Plugin system
[ok] TaskStore (temp)
[ok] HookDispatcher
[ok] Workspace config
All checks passed. flow v1.3.0
```

On failure:
```
[ok] Bundle integrity
[ok] Config loading
[FAIL] YAML flow parsing -- SyntaxError: unexpected token at line 3
Self-check failed (1/8 checks failed). Run: flow cli update --log
```

## Security considerations

- Plugins are loaded in manifest-only mode -- no activation, no side effects.
- Temp dir for TaskStore is always cleaned up.
- No network calls, no Claude API calls, no file writes outside OS temp dir.

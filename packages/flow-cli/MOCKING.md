# Mocking a step with `--mock-config`

`flow run <file> --mock-config <path>` replaces a step's real execution (model call or script)
with a canned result, so downstream step logic can be tested cheaply and deterministically.

Scope: daemon-dispatched `flow run` only. The in-process `FlowOrchestrator`/`FlowExecutor` path
does not support it.

## How it works

The config file is a YAML/JSON map of step id to an env overlay. The overlay is merged into that
step's `env` with the highest priority, overriding both the flow's global `env:` and the step's
own declared `env:`. For model steps this reaches the existing mock-CLI convention
(`*_MOCK_PATH`, `*_MOCK_RESPONSE`, `*_MOCK_EXIT_CODE`) implemented by the scripts in
`packages/flow-engine/src/testing/{claude,opencode,codex}-mock.mjs` — use those scripts as the
template for a custom scenario (multi-turn, simulated tool call, forced failure).

For script steps, no special handling is needed: the step's `env:` already reaches the
subprocess, so a mock-config entry is just env vars the script reads.

A step id in the config that does not exist in the flow, or that names a step with no `env`
(e.g. `user_intervention`), fails the run before anything is allocated.

## Example

```yaml
generate_flow:
    OPENCODE_MOCK_RESPONSE: |
        id: build_task
        name: Build task
    OPENCODE_MOCK_EXIT_CODE: '0'

generate_flow_check:
    OPENCODE_MOCK_EXIT_CODE: '1'
    OPENCODE_MOCK_RESPONSE: 'simulated check failure for retry testing'
```

```
flow run 02_plan.yml --mock-config fixtures/clean-yaml.yaml --wait
```

`generate_flow` returns the fixed YAML with no model call; `generate_flow_check` is forced to
fail with that stderr, exercising the step's retry/`subStepFeedback` path.

## Visible by design

Every overridden step prints a banner — `⚠ MOCK: step '<id>' output replaced by <config file>`
— to both the daemon log and the execution log, so a mocked run can never be mistaken for a
real one later.

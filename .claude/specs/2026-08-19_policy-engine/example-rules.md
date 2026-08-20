# Policy Engine — Example Rules & Feature Inventory

> Generated 2026-08-20. 30 rules across 5 roles, analyzed for v1/v2 scope.

---

## Rules

### Original (S1–S5)

## R-1 [QA] — Inject security-scan after implementation step

**Trigger:** `onStepEnd` where `stepId: implement-feature`
**Conditions:** `step_absent(security-scan)` AND `step_status(implement-feature, done)`
**Action:** inject `security-scan` (script, `parent: implement-feature`)
**New condition types needed:** `on.stepId` trigger filter
**Keep/Defer/Reject:** Keep (v1)

---

## R-2 [QA] — Block if no tests ran at flow end

**Trigger:** `onFlowEnd`
**Conditions:** `step_absent(run-tests)` OR `step_status(run-tests, skipped)`
**Action:** block — "No test step was executed"
**New condition types needed:** `operator: or`
**Keep/Defer/Reject:** Keep (v1)

---

## R-3 [QA] — Inject lint only if impl succeeded and lint absent

**Trigger:** `onStepEnd` where `stepId: implement-feature`
**Conditions:** `step_status(implement-feature, done)` AND `step_absent(lint-check)`
**Action:** inject `lint-check` (script)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-4 [Product Security] — Inject auto-fix if lint error detected in output

**Trigger:** `onStepFailed` where `stepId: lint-check`
**Conditions:** `output_match($current, field: "error", contains: "LINT_ERROR")`
**Action:** inject `auto-fix-lint` (script)
**New condition types needed:** `output_match { stepId, field, operator, value }`
**Keep/Defer/Reject:** Keep (v2)
**Reason:** output inspection requires v2 field access.

---

## R-5 [Engineering] — Block if too many steps injected (runaway guard)

**Trigger:** `onStepEnd`
**Conditions:** `step_count(scope: injected, gt: 10)`
**Action:** block — "Runaway injection detected"
**New condition types needed:** `step_count { scope, operator, value }`
**Keep/Defer/Reject:** Keep (v1)

---

### QA Engineer

## R-6 [QA] — Inject e2e-tests after unit-tests pass

**Trigger:** `onStepEnd` where `stepId: run-unit-tests`
**Conditions:** `step_status(run-unit-tests, done)` AND `step_absent(run-e2e-tests)`
**Action:** inject `run-e2e-tests` (script, `depends: [run-unit-tests]`)
**New condition types needed:** `on.stepId` trigger filter (shared with R-1)
**Keep/Defer/Reject:** Keep (v1)

---

## R-7 [QA] — Block if test coverage drops below threshold

**Trigger:** `onStepEnd` where `stepId: run-tests`
**Conditions:** `output_match(run-tests, field: "coverage", lt: 70)`
**Action:** block — "Coverage below 70%"
**New condition types needed:** `output_match` with numeric comparison
**Keep/Defer/Reject:** Keep (v2)
**Reason:** requires numeric output field access.

---

## R-8 [QA] — Inject regression-check if hotfix flag is set

**Trigger:** `onFlowStart`
**Conditions:** `input_match(key: "type", eq: "hotfix")` AND `step_absent(regression-check)`
**Action:** inject `regression-check` (script)
**New condition types needed:** `input_match { key, operator, value }`
**Keep/Defer/Reject:** Keep (v2)
**Reason:** input value matching is a v2 feature; `input_absent` (v1) doesn't cover value equality.

---

## R-9 [QA] — Inject snapshot-test after any UI component step

**Trigger:** `onStepEnd` where `stepId: build-ui-component`
**Conditions:** `step_absent(snapshot-test)`
**Action:** inject `snapshot-test` (script, `depends: [build-ui-component]`)
**New condition types needed:** none (trigger filter handles step scoping)
**Keep/Defer/Reject:** Keep (v1)

---

## R-10 [QA] — Block if a test step has failed more than 3 times

**Trigger:** `onStepFailed` where `stepId: run-tests`
**Conditions:** `step_failure_count(run-tests, gt: 3)`
**Action:** block — "Test step exceeded retry limit"
**New condition types needed:** `step_failure_count { stepId, operator, value }`
**Keep/Defer/Reject:** Keep (v2)
**Reason:** failure count tracking requires daemon-side state per step.

---

### Product Security

## R-11 [Product Security] — Inject dependency audit after npm install

**Trigger:** `onStepEnd` where `stepId: npm-install`
**Conditions:** `step_absent(dependency-audit)`
**Action:** inject `dependency-audit` (script: `npm audit --json`, `depends: [npm-install]`)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-12 [Product Security] — Block if secret-scan absent at flow end

**Trigger:** `onFlowEnd`
**Conditions:** `step_absent(secret-scan)`
**Action:** block — "Secret scan was never executed"
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-13 [Product Security] — Inject secret-scan at flow start if absent

**Trigger:** `onFlowStart`
**Conditions:** `step_absent(secret-scan)`
**Action:** inject `secret-scan` (script: `gitleaks detect`)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-14 [Product Security] — Block if dependency audit found critical vulnerabilities

**Trigger:** `onStepEnd` where `stepId: dependency-audit`
**Conditions:** `output_match(dependency-audit, field: "critical", gt: 0)`
**Action:** block — "Critical vulnerabilities found"
**New condition types needed:** `output_match` with numeric comparison
**Keep/Defer/Reject:** Keep (v2)
**Reason:** requires output field access.

---

## R-15 [Product Security] — Inject SAST scan after any model step completes

**Trigger:** `onStepEnd`
**Conditions:** `step_status($current, done)` AND `step_absent(sast-scan)`
**Action:** inject `sast-scan` (script, `depends: [$current]`)
**New condition types needed:** `$current` reference in `depends` array
**Keep/Defer/Reject:** Keep (v1)
**Reason:** `$current` in action's `depends` is a natural extension of the `$current` reference.

---

### Compliance

## R-16 [Compliance] — Inject audit log entry at flow start

**Trigger:** `onFlowStart`
**Conditions:** `step_absent(audit-log-entry)`
**Action:** inject `audit-log-entry` (script: posts to audit system)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-17 [Compliance] — Block deploy if approval-gate absent

**Trigger:** `onStepStart` where `stepId: deploy-to-production`
**Conditions:** `step_absent(approval-gate)` OR `step_status(approval-gate, skipped)`
**Action:** block — "Deployment requires prior approval-gate step"
**New condition types needed:** `on.stepId` on `onStepStart`
**Keep/Defer/Reject:** Keep (v1)

---

## R-18 [Compliance] — Inject data-classification-check if PII input flag set

**Trigger:** `onFlowStart`
**Conditions:** `input_match(key: "data_class", eq: "pii")` AND `step_absent(data-classification-check)`
**Action:** inject `data-classification-check` (script)
**New condition types needed:** `input_match { key, operator, value }`
**Keep/Defer/Reject:** Keep (v2)
**Reason:** same as R-8 — requires input value matching.

---

## R-19 [Compliance] — Block if flow exceeds SLA duration

**Trigger:** `onStepEnd`
**Conditions:** `flow_duration(gt: 3600, unit: seconds)`
**Action:** block — "Flow exceeded maximum SLA of 1 hour"
**New condition types needed:** `flow_duration { operator, value, unit }`
**Keep/Defer/Reject:** Keep (v2)
**Reason:** time-based condition requires daemon to include `startedAt` in payload; straightforward v2.

---

## R-20 [Compliance] — Inject GDPR check if a deletion step is present

**Trigger:** `onStepStart`
**Conditions:** `step_name_match(pattern: "delete|remove|purge")` AND `step_absent(gdpr-deletion-check)`
**Action:** inject `gdpr-deletion-check` (script)
**New condition types needed:** `step_name_match { pattern }` — regex match on step ID
**Keep/Defer/Reject:** Keep (v2)
**Reason:** pattern matching on step IDs requires regex evaluation.

---

### Engineering (Platform/Infra)

## R-21 [Engineering] — Block if total graph exceeds 20 steps

**Trigger:** `onStepEnd`
**Conditions:** `step_count(scope: total, gt: 20)`
**Action:** block — "Flow graph size exceeded safety limit"
**New condition types needed:** `step_count` with `scope: total` (vs `scope: injected` in R-5)
**Keep/Defer/Reject:** Keep (v1)

---

## R-22 [Engineering] — Inject timeout-guard if a model step runs too long

**Trigger:** `onStepStart`
**Conditions:** `step_duration($current, gt: 300, unit: seconds)`
**Action:** inject `timeout-guard` (script: kills the step)
**New condition types needed:** `step_duration { stepId, operator, value, unit }`
**Keep/Defer/Reject:** Keep (v2)
**Reason:** step duration requires `startedAt` per step in payload; policy engine is spawned on events, not polling — this rule cannot fire mid-step without a `onStepTimeout` event.

---

## R-23 [Engineering] — Reject: detect and block circular dependency in graph

**Trigger:** `onStepEnd`
**Conditions:** _(requires full graph traversal)_
**Action:** block
**New condition types needed:** graph analysis (cycle detection)
**Keep/Defer/Reject:** Reject
**Reason:** cycle detection belongs in the flow validator (`flow validate`), not the policy engine. The graph is validated before execution starts. Doing it at runtime adds no value.

---

## R-24 [Engineering] — Inject workspace cleanup on flow error

**Trigger:** `onFlowError`
**Conditions:** `step_absent(cleanup-workspace)`
**Action:** inject `cleanup-workspace` (script: `rm -rf .tmp`)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-25 [Engineering] — Block if a step has been retried more than 3 times

**Trigger:** `onStepFailed`
**Conditions:** `step_failure_count($current, gt: 3)`
**Action:** block — "Step exceeded maximum retry count"
**New condition types needed:** `step_failure_count` with `$current` reference
**Keep/Defer/Reject:** Keep (v2)
**Reason:** same as R-10.

---

### Operations

## R-26 [Operations] — Inject Slack notification on flow error

**Trigger:** `onFlowError`
**Conditions:** `step_absent(notify-slack-failure)`
**Action:** inject `notify-slack-failure` (script: `curl` Slack webhook)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-27 [Operations] — Block deploy if env-check absent

**Trigger:** `onStepStart` where `stepId: deploy-to-production`
**Conditions:** `step_absent(env-check)`
**Action:** block — "Environment check must run before deploy"
**New condition types needed:** none (reuses `on.stepId` trigger filter)
**Keep/Defer/Reject:** Keep (v1)

---

## R-28 [Operations] — Block if required input is absent

**Trigger:** `onFlowStart`
**Conditions:** `input_absent(key: "environment")`
**Action:** block — "Required input 'environment' is missing"
**New condition types needed:** `input_absent { key }`
**Keep/Defer/Reject:** Keep (v1)

---

## R-29 [Operations] — Inject health-check after deploy completes

**Trigger:** `onStepEnd` where `stepId: deploy-to-production`
**Conditions:** `step_absent(health-check)` AND `step_status(deploy-to-production, done)`
**Action:** inject `health-check` (script, `depends: [deploy-to-production]`)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## R-30 [Operations] — Inject rollback if deploy fails

**Trigger:** `onStepFailed` where `stepId: deploy-to-production`
**Conditions:** `step_absent(rollback)`
**Action:** inject `rollback` (script, `depends: [deploy-to-production]`)
**New condition types needed:** none
**Keep/Defer/Reject:** Keep (v1)

---

## Summary

| Verdict     | Count | Rules                                                |
| ----------- | ----- | ---------------------------------------------------- |
| **Keep v1** | 19    | R-1,2,3,5,6,9,11,12,13,15,16,17,21,24,26,27,28,29,30 |
| **Keep v2** | 10    | R-4,7,8,10,14,18,19,20,22,25                         |
| **Reject**  | 1     | R-23                                                 |

---

## Feature Inventory

### Condition types

| Feature                                                  | Type      | Required by                                          | v1/v2 |
| -------------------------------------------------------- | --------- | ---------------------------------------------------- | ----- |
| `step_absent { stepId }`                                 | condition | R-1,2,3,5,6,9,11,12,13,15,16,17,21,24,26,27,28,29,30 | v1    |
| `step_status { stepId, status }`                         | condition | R-1,2,3,6,15,17,29                                   | v1    |
| `step_count { scope: injected\|total, operator, value }` | condition | R-5, R-21                                            | v1    |
| `input_absent { key }`                                   | condition | R-28                                                 | v1    |
| `output_match { stepId, field, operator, value }`        | condition | R-4,7,14                                             | v2    |
| `input_match { key, operator, value }`                   | condition | R-8,18                                               | v2    |
| `step_failure_count { stepId, operator, value }`         | condition | R-10,25                                              | v2    |
| `flow_duration { operator, value, unit }`                | condition | R-19                                                 | v2    |
| `step_duration { stepId, operator, value, unit }`        | condition | R-22                                                 | v2    |
| `step_name_match { pattern }`                            | condition | R-20                                                 | v2    |

### Logical operators

| Feature                        | Type       | Required by          | v1/v2                             |
| ------------------------------ | ---------- | -------------------- | --------------------------------- |
| `and` (default)                | logical    | R-1,3,6,9,15,17,29   | v1                                |
| `or`                           | logical    | R-2,17               | v1                                |
| `gt`, `lt`, `eq`, `gte`, `lte` | comparison | R-5,7,14,19,21,22,25 | v1 (numeric in v2 output context) |
| `contains`, `matches`          | string     | R-4,8,18,20          | v2                                |

### Trigger filters

| Feature                                                  | Type       | Required by              | v1/v2 |
| -------------------------------------------------------- | ---------- | ------------------------ | ----- |
| `on.stepId` — filter event to a specific step            | trigger    | R-1,3,6,9,11,17,27,29,30 | v1    |
| `$current` — reference the step that triggered the event | ref        | R-4,15,25                | v1    |
| `$current` in `depends` array of injected step           | action ref | R-15                     | v1    |

### Action types

| Feature              | Type   | Required by                       | v1/v2 |
| -------------------- | ------ | --------------------------------- | ----- |
| `inject { steps[] }` | action | R-1,3,6,9,11,13,15,16,24,26,29,30 | v1    |
| `block { reason }`   | action | R-2,5,12,17,21,27,28              | v1    |

### Hook payload fields required

| Field                                        | Required by                  | v1/v2 |
| -------------------------------------------- | ---------------------------- | ----- |
| `executionId`                                | all                          | v1    |
| `event`                                      | all                          | v1    |
| `daemonApiUrl`                               | all                          | v1    |
| `daemonToken`                                | all                          | v1    |
| `stepId` — the step that triggered the event | trigger filter, `$current`   | v1    |
| `flowState.steps[].id`                       | step_absent, step_status     | v1    |
| `flowState.steps[].status`                   | step_status                  | v1    |
| `flowState.injectedStepCount`                | step_count (scope: injected) | v1    |
| `flowState.totalStepCount`                   | step_count (scope: total)    | v1    |
| `flowState.inputs`                           | input_absent, input_match    | v1    |
| `flowState.steps[].output`                   | output_match                 | v2    |
| `flowState.steps[].failureCount`             | step_failure_count           | v2    |
| `flowState.startedAt`                        | flow_duration                | v2    |
| `flowState.steps[].startedAt`                | step_duration                | v2    |

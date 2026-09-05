# V1 Test Scenarios

Three scenarios form a complete end-to-end flow validatable without real infrastructure.

## Flow definition used across all scenarios

```yaml
id: deploy-flow
inputs:
    - name: branch
      required: true

steps:
    - id: run-tests
      script: npm test -- --coverage --reporter=json
      produces:
          - attestation: tests-passed
            from: exit-code
          - attestation: coverage-report
            from: { file: coverage/report.json, format: jest }
            failIfAbsent: false

    - id: dummy-deploy
      script: |
          if [ -z "$PROD_API_KEY" ]; then exit 1; fi
          echo "OK"
      zone: production
      depends: [run-tests]
      env:
          PROD_API_KEY: ${{ secrets.PROD_API_KEY }}
```

Scope config (`<project-root>/.flows/zones.yml`):

```yaml
secrets:
    - id: PROD_API_KEY
      zone: production

zones:
    production:
        requires:
            - attestation: tests-passed
```

---

## Scenario 1a -- Unknown zone reference

**Setup:** A flow where a step declares `zone: staging` but no zone `staging` is defined in any scope config.

```yaml
steps:
    - id: dummy-deploy
      script: ./deploy.sh
      zone: staging # not defined in scope config
```

**Expected:** Static validation error at load time. The engine refuses to start the execution.

**What is validated:** Z4 case 1 -- a step references an undefined zone.

---

## Scenario 1b -- Secret used outside its zone

**Setup:** A flow where a step references `PROD_API_KEY` (declared `zone: production`) but the step has no `zone: production`.

```yaml
steps:
    - id: bad-step
      script: echo $PROD_API_KEY
      env:
          PROD_API_KEY: ${{ secrets.PROD_API_KEY }}
      # no zone declared
```

**Expected:** Static validation error at load time.

**What is validated:** Z5 -- a zone-scoped secret cannot be referenced outside its zone.

---

## Scenario 2 -- Zone entry blocked by missing attestation

**Setup:** Run the full flow but make `run-tests` fail (exit code non-zero).

**Expected:** `run-tests` fails → attestation `tests-passed` is not produced → zone `production` never becomes active → `dummy-deploy` is never scheduled → execution fails.

Log line NOT emitted: `[abc1|__zone] production ACTIVE`

**What is validated:** Zone activation requires all required attestations. A failed step does not produce its attestations.

---

## Scenario 3 -- Full happy path

**Setup:** Run the full flow with `run-tests` succeeding.

**Expected:**

1. `run-tests` completes with exit code 0
2. Attestation file created: `~/.flow-daemon/attestations/abc1-tests-passed.json`
3. Engine detects all required attestations for zone `production` are satisfied
4. Log line emitted: `[abc1|__zone] production ACTIVE`
5. `PROD_API_KEY` injected into `dummy-deploy` execution context
6. `dummy-deploy` script finds `$PROD_API_KEY` set → exits 0 → prints "OK"
7. Execution completes: `[abc1|__execution] COMPLETED`

**What is validated:** Full zone lifecycle -- attestation production, zone activation, secret injection, step execution.

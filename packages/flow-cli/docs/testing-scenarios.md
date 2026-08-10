# Manual Testing Scenarios

These scenarios validate end-to-end behavior that automated tests cannot cover (requires a live Claude CLI, real filesystem, and real processes).

## Prerequisites

```bash
# Build the package
cd packages/flow-cli
node build.mjs

# Ensure the flow and task binaries are accessible
flow --help    # or: npx flow
task --help
```

---

## Scenario 1 — Basic flow validation

**Purpose:** Verify `flow validate` exit codes and JSON output.

```bash
# S1.1 — Valid flow → exit 0, no output
flow validate src/test-utils/fixtures/hello-world.yml
echo "Exit: $?"   # Expected: 0

# S1.2 — Invalid flow (missing required field) → exit 1, JSON errors to stdout
cat > /tmp/invalid.yml << 'EOF'
id: bad-flow
steps:
  - id: step1
    type: script
    script: echo hello
EOF
flow validate /tmp/invalid.yml
echo "Exit: $?"   # Expected: 1
# Expected output: { "valid": false, "errors": [...] }

# S1.3 — File not found → exit 2
flow validate /tmp/nonexistent.yml
echo "Exit: $?"   # Expected: 2

# S1.4 — Malformed YAML → exit 3
echo "invalid: yaml: :" > /tmp/malformed.yml
flow validate /tmp/malformed.yml
echo "Exit: $?"   # Expected: 3
```

---

## Scenario 2 — Script step execution (no Claude required)

**Purpose:** Verify daemon startup, worker spawn, execution lifecycle, and state files.

```bash
# Create a test flow
cat > /tmp/test-flow.yml << 'EOF'
id: test-flow
version: "1.0.0"
name: Test Flow
description: Basic script test
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: greet
    type: script
    script: echo "Hello from flow!"
EOF

# S2.1 — Run the flow, get an execution ID
flow run /tmp/test-flow.yml
# Expected: prints 8-char alphanumeric ID (e.g. "abc12345") then exits

# S2.2 — Check execution state file was written
EXEC_ID=$(flow run /tmp/test-flow.yml)
cat ~/.flow-daemon/executions/${EXEC_ID}.json
# Expected: { "status": "completed", "steps": { "greet": { "status": "completed" } } }

# S2.3 — Check log file
cat ~/.flow-daemon/logs/$(date +%Y-%m-%d).ndjson | grep "$EXEC_ID"
# Expected: lines like [abc12345|__execution] Execution started...
#                      [abc12345|greet] (step log)
#                      [abc12345|__execution] Execution completed

# S2.4 — Quiet mode suppresses executionId
flow run /tmp/test-flow.yml --quiet
# Expected: no output, exits 0
```

---

## Scenario 3 — Multi-step flow with dependencies

**Purpose:** Verify dependency tracking and sequential execution.

```bash
cat > /tmp/deps-flow.yml << 'EOF'
id: deps-flow
version: "1.0.0"
name: Deps Flow
description: Steps with dependencies
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: step-a
    type: script
    script: echo "A done" && sleep 0.1
  - id: step-b
    type: script
    script: echo "B done"
    depends: [step-a]
  - id: step-c
    type: script
    script: echo "C done"
    depends: [step-a]
  - id: step-d
    type: script
    script: echo "D done"
    depends: [step-b, step-c]
EOF

EXEC_ID=$(flow run /tmp/deps-flow.yml)
sleep 2
cat ~/.flow-daemon/executions/${EXEC_ID}.json | python3 -m json.tool
# Expected: all 4 steps completed, status: "completed"
# Verify order via log timestamps: A before B and C, B and C before D
```

---

## Scenario 4 — Failed step

**Purpose:** Verify failure propagation and execution state.

```bash
cat > /tmp/fail-flow.yml << 'EOF'
id: fail-flow
version: "1.0.0"
name: Fail Flow
description: A step that fails
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: fail-step
    type: script
    script: exit 1
EOF

EXEC_ID=$(flow run /tmp/fail-flow.yml)
sleep 1
cat ~/.flow-daemon/executions/${EXEC_ID}.json | python3 -m json.tool
# Expected: status: "failed", steps.fail-step.status: "failed"
```

---

## Scenario 5 — Inputs

**Purpose:** Verify input passing and template rendering in scripts.

```bash
cat > /tmp/inputs-flow.yml << 'EOF'
id: inputs-flow
version: "1.0.0"
name: Inputs Flow
description: Flow with inputs
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs:
  name:
    type: string
    required: true
steps:
  - id: greet
    type: script
    script: echo "Hello, $NAME"
    env:
      NAME: ${{ inputs.name }}
EOF

EXEC_ID=$(flow run /tmp/inputs-flow.yml --input=name=World)
sleep 1
cat ~/.flow-daemon/logs/$(date +%Y-%m-%d).ndjson | grep "$EXEC_ID"
# Expected: log line containing "Hello, World"
```

---

## Scenario 6 — Daemon reuse (second run connects to existing daemon)

**Purpose:** Verify the daemon stays alive between runs and handles multiple executions.

```bash
# Run first flow
ID1=$(flow run /tmp/test-flow.yml)
echo "First: $ID1"

# Run second flow immediately — should connect to existing daemon
ID2=$(flow run /tmp/test-flow.yml)
echo "Second: $ID2"

# Both should complete
sleep 2
cat ~/.flow-daemon/executions/${ID1}.json | grep '"status"'
cat ~/.flow-daemon/executions/${ID2}.json | grep '"status"'
# Expected: both "completed"

# Check PID file exists (daemon still running)
cat ~/.flow-daemon/config.pid
```

---

## Scenario 7 — user_intervention step rejected

**Purpose:** Verify D8 — user_intervention steps fail fast.

```bash
cat > /tmp/intervention-flow.yml << 'EOF'
id: intervention-flow
version: "1.0.0"
name: Intervention Flow
description: Has user intervention
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: approve
    type: user_intervention
    message: "Please approve"
EOF

flow run /tmp/intervention-flow.yml
echo "Exit: $?"
# Expected: exit 1, error JSON with code: "UNSUPPORTED_STEP_TYPE"
```

---

## Scenario 8 — task CLI

**Purpose:** Verify task CRUD and status transitions.

```bash
mkdir -p /tmp/myproject && cd /tmp/myproject

# S8.1 — Create a task
OUTPUT=$(task new "Implement feature X")
echo $OUTPUT | python3 -m json.tool
# Expected: { "id": "...", "title": "Implement feature X", "status": "created", ... }
TASK_ID=$(echo $OUTPUT | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# S8.2 — List tasks
task list
# Expected: JSON array with the task

# S8.3 — Show task
task show $TASK_ID
# Expected: full task JSON with history

# S8.4 — Approve task
task approve $TASK_ID
# Expected: task with status: "approved"

# S8.5 — Set arbitrary status
task set-status $TASK_ID done
# Expected: task with status: "done"

# S8.6 — Verify history tracks all transitions
task show $TASK_ID | python3 -m json.tool
# Expected: history array: [created, approved, done]

# S8.7 — Index file exists
cat /tmp/myproject/.flows/tasks/index.json
# Expected: { "tasks": [{ "id": "...", "title": "...", "status": "done" }] }
```

---

## Scenario 9 — Hooks (requires a hook handler script)

**Purpose:** Verify HookDispatcher fires hooks on lifecycle events.

```bash
mkdir -p /tmp/hooks-project/.flows
cat > /tmp/hooks-project/.flows/config.yml << 'EOF'
version: 1
hooks:
  onFlowStart:
    - type: cli
      command: bash
      args: ["-c", "echo 'HOOK: flow started' >> /tmp/hook-log.txt"]
  onFlowEnd:
    - type: cli
      command: bash
      args: ["-c", "echo 'HOOK: flow ended' >> /tmp/hook-log.txt"]
  onTaskCreated:
    - type: cli
      command: bash
      args: ["-c", "echo 'HOOK: task created' >> /tmp/hook-log.txt"]
EOF

rm -f /tmp/hook-log.txt

# Run a flow from the hooks-project directory
cd /tmp/hooks-project
flow run /tmp/test-flow.yml
sleep 2

cat /tmp/hook-log.txt
# Expected: lines "HOOK: flow started" and "HOOK: flow ended"

# Create a task
task new "Hook test task"
cat /tmp/hook-log.txt
# Expected: "HOOK: task created" appended
```

---

## Scenario 10 — Env isolation (NOTHING default)

**Purpose:** Verify workers get no environment variables unless explicitly declared.

```bash
export LEAKED_SECRET="should-not-appear"

cat > /tmp/env-flow.yml << 'EOF'
id: env-flow
version: "1.0.0"
name: Env Flow
description: Tests env isolation
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: check-env
    type: script
    script: env | sort
EOF

EXEC_ID=$(flow run /tmp/env-flow.yml)
sleep 1
cat ~/.flow-daemon/logs/$(date +%Y-%m-%d).ndjson | grep "$EXEC_ID" | grep "LEAKED"
# Expected: no output — LEAKED_SECRET must not appear in the worker's env
```

---

## Scenario 11 — Log rotation

**Purpose:** Verify old log files are pruned after retainDays.

```bash
# Check current log file count
ls ~/.flow-daemon/logs/ | wc -l

# Check rotation config (default 30 days)
cat ~/.flow-config.yaml 2>/dev/null || echo "Using defaults: retainDays=30"

# After many days of use, logs older than 30 days should be deleted automatically
# Verify by checking file dates:
ls -la ~/.flow-daemon/logs/
```

---

## Scenario 12 — Concurrent executions

**Purpose:** Verify concurrency=1 serializes executions, concurrency=2 runs them in parallel.

```bash
cat > ~/.flow-config.yaml << 'EOF'
queue:
  concurrency: 2
logs:
  retainDays: 30
worker:
  wsPort: null
EOF

# Run 3 flows concurrently
ID1=$(flow run /tmp/test-flow.yml &)
ID2=$(flow run /tmp/test-flow.yml &)
ID3=$(flow run /tmp/test-flow.yml &)
wait

sleep 3
# Expected: all 3 completed
# With concurrency=2: at most 2 workers active simultaneously (verify via log timestamps)
```

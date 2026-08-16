# Model Step Tool Logging

When a model step runs Claude in agentic mode, tool calls happen silently by default. Two approaches exist to surface them in logs.

---

## Option A — stream-json event mapping (implemented)

**How it works:** Claude CLI `--output-format stream-json` emits NDJSON events inline:
1. `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"sleep 5"}}]}}` — Claude decides to call a tool
2. `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu_xxx","content":"..."}]}}` — result returned to Claude

`StreamEventMapper` parses these into `LiveLogEntry` objects with `eventType: 'tool_use'` and `eventType: 'tool_result'`. `WorkerAdapter` forwards them to the daemon via WebSocket → written to log file → displayed in `flow run --wait`.

**Config:** `toolLog` parameter on the model step. Only active when `log: streaming` or `log: polling`.

```yaml
- id: generate
  type: model
  model: haiku
  log: streaming
  toolLog: name       # name | full | none (default: none)
```

| `toolLog` | Shows |
|-----------|-------|
| `none` | Nothing (default) |
| `name` | `→ Bash` — tool name only |
| `full` | `→ Bash: sleep 5` / `← Bash: (result)` — name + input + output |

**Pros:**
- Zero infrastructure change — same daemon/worker pipeline
- Works with existing WebSocket log delivery
- Deterministic: same source as text logs
- No Claude CLI flags needed beyond `--output-format stream-json`

**Cons:**
- Only shows what stream-json exposes — name + input, tool result as-is
- Tool results come back as `user` events (may arrive slightly delayed)
- Input truncated to ~300 chars by `StreamEventMapper.summarizeToolInput`
- No precise timing of when the tool *completed* (result event arrives after execution)

---

## Option C — Temporary hooks injected at launch (not implemented)

**How it would work:** Inject a `PostToolUse` hook into Claude's settings at launch time. The hook fires exactly when a tool completes and can write structured data to a named pipe or temp file. StepRunner tails that file and emits log entries.

Claude CLI hook format (`--hooks` flag or `.claude/settings.json`):
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{ "type": "command", "command": "echo $TOOL_NAME >> /tmp/tool-log.ndjson" }]
    }]
  }
}
```

**Pros:**
- Official mechanism — fires exactly when tool execution completes
- Rich data: env vars include tool name, input, output, exit code
- Can show intermediate tool output streaming in real-time
- Works even for tools that produce large outputs (streamed directly)

**Cons:**
- Requires writing a temp hook script + lifecycle management (cleanup on crash)
- Hook must be injected at Claude launch time (before the session starts)
- May conflict with the user's existing `PostToolUse` hooks in their project
- Adds latency per tool call (hook command must complete before next step)
- Hook env var format may change between Claude CLI versions

**When to use Option C:** If Option A is insufficient — e.g., you need sub-second timing accuracy for tool calls, or you want to stream very large tool outputs line by line.

---

## Example: task-model2.yml

```yaml
- id: generate
  type: model
  model: haiku
  log: streaming
  toolLog: name
  prompt: |
    Tell me the time, sleep 5s, say hello, sleep 5s, say goodbye.
```

Output with `toolLog: name`:
```
[13:28:11.335] [generate] Claude: I'm Claude...
[13:28:11.521] [generate] → Bash
[13:28:22.899] [generate] Claude: Hello! The current time is 15:28:21
[13:28:23.088] [generate] → Bash
[13:28:31.411] [generate] Claude: Goodbye!
```

---
name: dev-hold
description: Pause a specific server endpoint mid-request to capture in-flight UI states (loading spinners, opacity-during-save, etc.) with agent-browser screenshots. Use before triggering any browser action where you need to screenshot a loading state.
allowed-tools:
    - Bash
#context: fork
---

# DevHold Skill — Deterministic In-Flight Screenshot Testing

Pauses the backend server on a specific URL pattern until you explicitly release it.
This lets you screenshot the UI **while** a save/load is in progress, without relying on
fragile sleep timers or `window.fetch` overrides that break on page reload.

## Port

Backend port = `3000 + (PROJECT_ID * 100) + (WORKSPACE_ID * 10)`

| Workspace | Backend port |
| --------- | ------------ |
| ws2       | 3320         |

## Workflow

```bash
# 1. Register a hold — server will pause any request matching the pattern
HOLD_ID=$(curl -s -X POST http://localhost:3320/dev/hold \
  -H "Content-Type: application/json" \
  -d '{"pattern":"PATCH /api/tickets"}' | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).holdId))")
echo "Hold registered: $HOLD_ID"

# 2. Trigger the browser action (blur, click, drag, status change…)
agent-browser click @e20          # or whatever triggers the save

# 3. Screenshot WHILE the request is blocked → loading state visible
agent-browser screenshot /tmp/during-save.png

# 4. Release — server processes the request and responds
curl -s -X DELETE http://localhost:3320/dev/hold/$HOLD_ID

# 5. Wait for UI to settle, then screenshot the final state
agent-browser wait --load networkidle
agent-browser screenshot /tmp/after-save.png
```

## Pattern matching

| Pattern | Matches |
| ------- | ------- |
| `"PATCH /api/tickets"` | `PATCH /api/tickets/abc123` |
| `"/api/tickets"` | any method on `/api/tickets/*` |
| `"GET /api/tasks"` | `GET /api/tasks?status=running` |

## Other endpoints

```bash
# List active holds
curl http://localhost:3320/dev/holds

# Release a specific hold
curl -X DELETE http://localhost:3320/dev/hold/<holdId>
```

Holds **auto-expire after 30 seconds** to prevent server lockup.

## Why not alternatives?

| Approach | Problem |
| -------- | ------- |
| `window.fetch` override | Breaks on page reload |
| `agent-browser wait N` | Fragile — fast localhost < 1 frame |
| Network throttle | Slows all requests including assets |
| **DevHold** | ✅ Exact, deterministic, per-endpoint |

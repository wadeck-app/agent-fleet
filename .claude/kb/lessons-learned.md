# Lessons Learned

## tsx watch + Terminal-Kit UI = Broken Keyboard Input

**Problem**: When running terminal-kit-based UIs (OrchestratorUI, FlowWorkerUI) with `tsx watch`, keyboard input does NOT work. Keys are captured by tsx and never reach terminal-kit.

**Root Cause**: `tsx watch` captures stdin to detect restart commands (like 'rs'). This interferes with terminal-kit's stdin capture, preventing keyboard events from being detected.

**Solution - Use correct scripts:**
```bash
# ✅ UI mode (keyboard works)
npm run orch:ui
npm run worker:flow:ui

# ✅ Dev mode (headless, auto-reload)
npm run orch:dev
npm run worker:flow

# ❌ NEVER mix watch + UI
```

**Why**: stdin is a single stream. Node.js processes stdin events through EventEmitter - the first `data` listener registered gets all events. tsx watch's listener consumes all stdin, preventing terminal-kit from receiving keyboard events.

**Detection**: Both UI classes detect the problem at startup by checking `process.stdin.listenerCount('data')` and display a warning if existing listeners are found.

**When discovered**: December 2024 during orchestrator refactoring. Root cause identified through testing with `test-terminal-kit-*.ts` files.

**Reference**: See `.agent-fleet/.claude/docs/terminal-kit-tsx-issue.md` for complete technical details, testing procedures, and alternative solutions considered.

**Related files**:
- `src/orchestrator/ui/OrchestratorUI.ts` - UI implementation with detection
- `src/workers/flow/ui/FlowWorkerUI.ts` - Worker UI with same pattern
- `test-terminal-kit-stdin.ts` - Demonstrates the stdin conflict
- `test-terminal-kit-watch.ts` - Shows watch mode breaking keyboard input

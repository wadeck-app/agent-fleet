# Terminal-Kit + tsx watch Mode Issue

## Problem Statement

When running terminal-kit-based UIs (OrchestratorUI, FlowWorkerUI) with `tsx watch`, keyboard input does NOT work. Keys are captured by tsx and never reach terminal-kit.

## Root Cause

`tsx watch` sets up stdin listeners to detect restart commands (like 'rs'). This interferes with terminal-kit's stdin capture mechanism:

```typescript
// tsx watch sets up:
process.stdin.on('data', (data) => {
  if (data.toString() === 'rs\n') restart();
});

// terminal-kit also needs:
process.stdin.on('data', handleKeypress); // Never receives events!
```

Since Node.js stdin is a single stream, only the first listener gets priority.

## Impact

### Affected Components
- `src/orchestrator/ui/OrchestratorUI.ts` - Full UI broken
- `src/workers/flow/ui/FlowWorkerUI.ts` - Interactive features broken

### Symptoms
- Keys pressed have no effect
- No visual feedback from keyboard
- Menu navigation doesn't work
- Quit commands ignored

## Solution

### Use Separate Scripts

```bash
# ✅ CORRECT - UI mode (no watch)
npm run orch:ui
npm run worker:flow:ui

# Equivalent to:
tsx src/orchestrator/core/index.ts
tsx src/workers/flow/FlowWorker.ts --ui

# ❌ WRONG - Dev mode with watch (no UI support)
npm run orch:dev        # Good for headless development
npm run worker:flow     # Good for automated workflows
```

### Script Organization

From `package.json`:

```json
{
  "scripts": {
    "orch:dev": "tsx src/orchestrator/core/index.ts",
    "orch:ui": "tsx src/orchestrator/core/index.ts",
    "worker:flow": "tsx src/workers/flow/FlowWorker.ts",
    "worker:flow:ui": "tsx src/workers/flow/FlowWorker.ts"
  }
}
```

**Note:** Currently `orch:dev` and `orch:ui` use the same command. The distinction is semantic for future differentiation.

## Detection and Warnings

Both UI classes detect the problem at startup:

```typescript
// src/orchestrator/ui/OrchestratorUI.ts
const existingListeners = process.stdin.listenerCount('data');
if (existingListeners > 0) {
  console.warn('⚠️  WARNING: Detected stdin listeners (likely tsx watch mode)');
  console.warn('⚠️  Keyboard input will NOT work properly in the UI');
  console.warn('⚠️  Solution: Run without watch mode');
}
```

This check happens before terminal-kit initialization to warn developers early.

## Testing

### Test Files
- `test-terminal-kit-stdin.ts` - Demonstrates the stdin conflict
- `test-terminal-kit-watch.ts` - Shows watch mode breaking keyboard input

### Manual Testing
```bash
# Test 1: Verify UI works without watch
tsx src/orchestrator/core/index.ts
# Try pressing keys - should work

# Test 2: Verify UI breaks with watch (don't do this in production!)
tsx watch src/orchestrator/core/index.ts
# Try pressing keys - won't work
```

## Technical Details

### stdin Listener Priority
Node.js processes stdin events through EventEmitter:

1. First `data` listener registered gets all events
2. Subsequent listeners only fire if first one doesn't consume
3. tsx watch's listener consumes all stdin

### terminal-kit Requirements
terminal-kit needs:
- Raw mode stdin access (`stdin.setRawMode(true)`)
- Direct key event handling
- No competing listeners

### Why Separate Processes Work
Running without watch means:
- No tsx stdin listeners
- terminal-kit gets exclusive stdin access
- Keyboard events flow directly to UI

## Workarounds Considered

### Option 1: Remove tsx stdin listeners (❌ Rejected)
Can't reliably remove tsx's internal listeners without breaking tsx itself.

### Option 2: stdin proxy (❌ Rejected)
Too complex, adds latency, error-prone.

### Option 3: Separate processes (✅ Chosen)
Simple, reliable, clear separation of concerns.

## Best Practices

### For Development
- Use `npm run orch:dev` for headless development with hot reload
- Use `npm run orch:ui` for UI testing (restart manually on changes)

### For Production
- Always use non-watch mode: `node dist/orchestrator/core/index.js`
- UI and watch mode are mutually exclusive by design

### For CI/CD
- Use headless mode in pipelines
- Never rely on keyboard input in automated environments

## Related Files

- `src/orchestrator/ui/OrchestratorUI.ts` - UI implementation with detection
- `src/workers/flow/ui/FlowWorkerUI.ts` - Worker UI with same pattern
- `package.json` - Script definitions
- `test-terminal-kit-*.ts` - Demonstration and testing files

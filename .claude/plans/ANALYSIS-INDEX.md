# Backend Startup and Shutdown Flow - Analysis Index

## Quick Navigation

### Documents Created

1. **2025-12-23-backend-startup-shutdown-analysis.md**
   - Complete technical analysis
   - 256 lines of detailed documentation
   - Line-by-line code references
   - All initialization and shutdown sequences documented
   - Port calculations explained

2. **STARTUP-SHUTDOWN-FINDINGS.txt**
   - Executive summary (formatted text)
   - Critical issues highlighted
   - All server instances with cleanup status
   - Recommended fixes by priority
   - Signal handling analysis

3. **SERVER-INSTANCES-REFERENCE.txt**
   - Detailed reference table for all servers
   - Each server documented with:
     - File locations
     - Port information
     - Startup/shutdown code
     - Current status
   - Port binding sequence
   - Environment variable reference

## Key Findings

### Critical Issue #1: Orchestrator Not Shut Down
- **Severity**: CRITICAL
- **Location**: `packages/web-backend/src/server.ts:397`
- **Impact**: Ports 3737 and 3738 remain bound, causing "Port already in use" on nodemon restart
- **Fix**: Store orchestrator instance and call `orchestrator.shutdown()` in SIGTERM handler

### Critical Issue #2: WebSocket Transport Server Not Cleaned
- **Severity**: HIGH
- **Location**: `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`
- **Impact**: Timers not cleared, connections not closed, memory leak
- **Fix**: Add `stop()` method to clear timers and close connections

### Issue #3: Orchestrator Event Listeners Not Removable
- **Severity**: MODERATE
- **Location**: `packages/orchestrator-adapters/src/adapters/LibraryAdapter.ts:324-348`
- **Impact**: Incomplete cleanup of composite event handlers
- **Fix**: Track wrapped handlers to allow proper removal

## Server Inventory

### Properly Shut Down
- ✅ Fastify HTTP Server (port 3000)

### Not Shut Down
- ❌ Orchestrator REST API Server (port 3737)
- ❌ Worker WebSocket Server (port 3738)
- ❌ UI WebSocket Server (port 3737)
- ❌ Metrics Collector
- ❌ UI Client Hook
- ❌ WebSocket Transport Server (backend)

## Recommended Fixes

### Priority 1 - CRITICAL
Store orchestrator instance for shutdown
- File: `packages/web-backend/src/server.ts`
- Add module-level variable to store orchestrator
- Call `orchestrator.shutdown()` in SIGTERM handler

### Priority 2 - HIGH
Add cleanup for WebSocketTransportServer
- File: `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`
- Implement `stop()` method
- Clear timers and close connections

### Priority 3 - HIGH
Fix orchestrator event listener removal
- File: `packages/orchestrator-adapters/src/adapters/LibraryAdapter.ts`
- Track wrapped handlers for composite events
- Allow proper unsubscription

### Priority 4 - MEDIUM
Add shutdown timeout protection
- File: `packages/web-backend/src/server.ts`
- Force exit after 5 seconds if shutdown hangs

### Priority 5 - MEDIUM
Handle additional signals
- File: `packages/web-backend/src/server.ts`
- Add SIGHUP and uncaught exception handlers

## Analysis Statistics

- **Files Analyzed**: 15+
- **Code Lines Reviewed**: 3000+
- **Issues Identified**: 3 Critical/High + 1 Moderate
- **Servers Created**: 5 instances (1 properly shut down, 4 not)
- **Ports Used**: 3000 (backend), 3737 (orch REST), 3738 (orch WS)

## Nodemon Issue Summary

When files change during development:
1. nodemon detects file change
2. Sends SIGTERM to process
3. Event bridge disposed ✓
4. Fastify closed ✓
5. ❌ Orchestrator NOT shut down
6. Port 3737 and 3738 still bound
7. New process tries to bind same ports
8. "Port already in use" error
9. Backend crashes 💥

## Documentation Files Location

All files saved to:
```
C:\Workspace_Tooling\agent-fleet\.claude\plans\
```

Files created:
- `2025-12-23-backend-startup-shutdown-analysis.md` - Technical deep-dive
- `STARTUP-SHUTDOWN-FINDINGS.txt` - Executive summary
- `SERVER-INSTANCES-REFERENCE.txt` - Detailed reference
- `ANALYSIS-INDEX.md` - This file

## Quick Reference

### Entry Point
- `packages/web-backend/src/server.ts` - Main server file

### Orchestrator Initialization
- `packages/web-backend/src/server.ts:46-81` - initializeOrchestratorClient()
- `packages/orchestrator/src/core/index.ts` - Orchestrator class

### Graceful Shutdown
- `packages/web-backend/src/server.ts:470-485` - Signal handlers

### WebSocket Servers
- Backend: `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`
- Orchestrator: `packages/orchestrator/src/websocket/WorkerWebSocketServer.ts`

### REST API
- `packages/orchestrator/src/core/RestAPI.ts` - Orchestrator REST API

## Next Steps

1. Review findings in provided documents
2. Prioritize fixes by severity and impact
3. Implement fixes in this order:
   - Priority 1: Store orchestrator instance
   - Priority 2: Add WebSocketTransportServer cleanup
   - Priority 3: Fix event listener removal
   - Priority 4-5: Additional improvements

4. Test changes with:
   - `npm run dev:library`
   - File changes to trigger nodemon restart
   - Verify no "Port already in use" errors
   - Check clean server shutdown

## Questions?

Refer to the detailed documents for:
- Line-by-line code analysis
- Exact file locations
- Current vs. expected behavior
- Port calculation formulas
- Signal handling details
- Full shutdown sequences

---

**Analysis Date**: 2025-12-23
**Status**: Complete and Ready for Implementation

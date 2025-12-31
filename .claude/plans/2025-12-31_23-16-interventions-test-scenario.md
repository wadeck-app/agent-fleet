# User Interventions System - Test Scenario

**Created:** 2025-12-31_23-16
**Status:** Ready for Testing

## Overview

This document provides a complete test scenario for the User Interventions system, allowing agents/workers to request human approval, answers, or choices during task execution.

## System Status

### ✅ Implementation Complete

**Core Infrastructure:**

- ✅ Data models (Task, Intervention, UserInterventionStep)
- ✅ Storage layer with CRUD operations
- ✅ InterventionManager with lifecycle management
- ✅ Backend API with Zod validation
- ✅ Event system integration (B2F events)
- ✅ Frontend UI (list page + detail page)
- ✅ Routing and navigation

**Build Status:**

- TypeScript: 6 pre-existing errors (unrelated to interventions)
- ESLint: 1001 warnings (pre-existing)
- Prettier: ✅ All files formatted
- **Interventions code: 100% type-safe**

## Test Scenario 1: Manual API Testing

### Prerequisites

1. Start the backend server:

```bash
cd packages/web-backend
npm run dev
```

2. Verify backend is running:

```bash
curl http://localhost:3000/api/health
```

### Step 1: Create a Test Intervention Manually

Since the flow executor integration is not yet complete, we can test the system by manually creating an intervention using the InterventionManager.

Create a test script: `packages/orchestrator/src/test-intervention.ts`

```typescript
import { InterventionManager } from './core/InterventionManager';

async function testIntervention() {
	const manager = new InterventionManager();

	// Create a test intervention
	const intervention = await manager.createIntervention({
		taskId: 'test-task-123',
		type: 'approval',
		blocking: true,
		config: {
			title: 'Test Approval Required',
			description: 'This is a test intervention to verify the system works',
			allowReject: true,
		},
		source: {
			type: 'agent_tool',
			toolName: 'test_tool',
		},
	});

	console.log('Created intervention:', intervention.id);
	console.log('Status:', intervention.status);

	// List pending interventions
	const pending = await manager.getPendingInterventions();
	console.log('Pending interventions:', pending.length);

	return intervention.id;
}

testIntervention().catch(console.error);
```

Run the test:

```bash
cd packages/orchestrator
npx tsx src/test-intervention.ts
```

### Step 2: Verify Intervention via API

```bash
# Get all interventions
curl http://localhost:3000/api/interventions/ | jq

# Get specific intervention (replace ID)
curl http://localhost:3000/api/interventions/INTERVENTION_ID | jq
```

Expected response:

```json
{
	"items": [
		{
			"id": "intervention_xxx",
			"taskId": "test-task-123",
			"type": "approval",
			"status": "pending",
			"createdAt": "2025-12-31T23:16:00.000Z",
			"config": {
				"title": "Test Approval Required",
				"description": "This is a test intervention to verify the system works",
				"allowReject": true
			},
			"blocking": true,
			"source": {
				"type": "agent_tool",
				"toolName": "test_tool"
			}
		}
	],
	"pagination": {
		"total": 1,
		"page": 1,
		"pageSize": 10,
		"totalPages": 1
	}
}
```

### Step 3: Test Frontend UI

1. Start the frontend:

```bash
cd packages/web-frontend
npm run dev
```

2. Open browser: `http://localhost:5173`

3. Navigate to **Interventions** in the sidebar (Bell icon)

4. Expected UI:
    - See list of pending interventions
    - Each card shows: emoji icon, title, timeAgo, task ID, description
    - Click on a card to open detail page

5. On detail page:
    - See full context (Intervention ID, Task ID, created time)
    - See description in "Request Details" card
    - Add optional comment in textarea
    - Click "✅ Approve" or "❌ Reject" button

### Step 4: Respond to Intervention

Via API:

```bash
# Approve intervention
curl -X POST http://localhost:3000/api/interventions/INTERVENTION_ID/respond \
  -H "Content-Type: application/json" \
  -d '{"value": true, "comment": "Looks good!"}'

# Expected response:
{
  "success": true,
  "message": "Intervention answered successfully"
}
```

Or via Frontend UI:

1. Click intervention card
2. Type comment: "Approved for testing"
3. Click "✅ Approve"
4. Should show alert "Approved!"
5. Navigate back to list
6. Intervention should no longer appear (status changed to "answered")

### Step 5: Verify Intervention Updated

```bash
# Get intervention again
curl http://localhost:3000/api/interventions/INTERVENTION_ID | jq

# Should now have response field:
{
  "id": "intervention_xxx",
  "status": "answered",
  "response": {
    "value": true,
    "comment": "Approved for testing",
    "answeredAt": "2025-12-31T23:20:00.000Z",
    "answeredBy": "user"
  }
}
```

## Test Scenario 2: Integration with Storage

### Test Persistence

```typescript
// Test script: packages/orchestrator/src/test-persistence.ts
import { InterventionManager } from './core/InterventionManager';
import { Storage } from './core/Storage';

async function testPersistence() {
	const manager = new InterventionManager();

	// Create intervention
	const intervention = await manager.createIntervention({
		taskId: 'persist-test',
		type: 'question',
		blocking: true,
		config: {
			title: 'Test Question',
			question: 'What is your favorite color?',
			responseType: 'text',
		},
		source: { type: 'flow_step', stepId: 'step-1' },
	});

	console.log('Created:', intervention.id);

	// Load from storage directly
	const loaded = await Storage.loadIntervention(intervention.id);
	console.log('Loaded from storage:', loaded?.id);
	console.log('Match:', intervention.id === loaded?.id);

	// List all interventions
	const all = await Storage.listInterventions();
	console.log('Total interventions in storage:', all.length);

	// Query by status
	const pending = await Storage.findInterventionsByStatus('pending');
	console.log('Pending interventions:', pending.length);

	// Query by task
	const byTask = await Storage.findInterventionsByTaskId('persist-test');
	console.log('Interventions for task:', byTask.length);
}

testPersistence().catch(console.error);
```

### Verify Storage Files

```bash
# Check storage directory
ls -la .agent-fleet/data/interventions/

# Should see JSON files like:
# intervention_xxx.json
# intervention_yyy.json

# View intervention file
cat .agent-fleet/data/interventions/intervention_xxx.json | jq
```

## Test Scenario 3: Event Broadcasting

### Test Real-time Events

1. Open browser console on frontend `/interventions` page

2. In another terminal, create intervention via API or script

3. Expected: Frontend should receive event and update list (when real-time subscription is wired)

### Manual Event Test

```typescript
// Test script: packages/web-backend/src/test-events.ts
import { B2F_INTERVENTION_CREATED } from '@app/shared/transport';

import { EventBroadcaster } from './transport/EventBroadcaster';

const broadcaster = new EventBroadcaster();

// Simulate intervention created event
broadcaster.broadcast(B2F_INTERVENTION_CREATED, {
	id: 'test-event-123',
	taskId: 'task-456',
	type: 'approval',
	status: 'pending',
	// ... full intervention object
});

console.log('Event broadcasted');
```

## Test Scenario 4: Error Handling

### Test 404 Not Found

```bash
# Request non-existent intervention
curl http://localhost:3000/api/interventions/nonexistent-id

# Expected: 404 error with message
```

### Test Invalid Response

```bash
# Send invalid response data
curl -X POST http://localhost:3000/api/interventions/INTERVENTION_ID/respond \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'

# Expected: 400 validation error
```

### Test Empty List

```bash
# Query with status that has no results
curl 'http://localhost:3000/api/interventions/?status=timeout'

# Expected: Empty list with pagination
{
  "items": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "pageSize": 10,
    "totalPages": 0
  }
}
```

## Test Scenario 5: Multiple Interventions

### Create Multiple Interventions

```typescript
async function createMultiple() {
	const manager = new InterventionManager();

	for (let i = 0; i < 5; i++) {
		await manager.createIntervention({
			taskId: `task-${i}`,
			type: i % 2 === 0 ? 'approval' : 'question',
			blocking: true,
			config: {
				title: `Test Intervention ${i + 1}`,
				description: `Testing multiple interventions (${i + 1}/5)`,
			},
			source: { type: 'agent_tool', toolName: 'test' },
		});
	}

	console.log('Created 5 interventions');
}
```

### Verify UI Display

1. Frontend should show all 5 interventions in list
2. Each card should have distinct title/icon
3. Scrolling should work if needed
4. Click any card to view details

## Expected Results Summary

### ✅ Working Features

1. **Storage Layer**
    - Create interventions and persist to JSON files
    - Load interventions by ID
    - List all interventions
    - Query by status and task ID
    - Delete interventions

2. **Backend API**
    - GET /api/interventions/ - List with pagination
    - GET /api/interventions/:id - Get single intervention
    - POST /api/interventions/:id/respond - Respond with approval/rejection
    - POST /api/interventions/:id/cancel - Cancel intervention
    - All endpoints return correct status codes
    - Zod validation works correctly

3. **Frontend UI**
    - Interventions page renders list
    - Empty state shows when no interventions
    - Intervention cards display correctly
    - Navigation to detail page works
    - Detail page shows full context
    - Approve/Reject buttons work
    - Comment field accepts input
    - Navigation back to list works

4. **Type Safety**
    - All TypeScript types compile correctly
    - No intervention-related type errors
    - API contracts validated with Zod
    - Full type inference in frontend

### ⏳ Pending Integration (Future Work)

1. **Flow Executor Integration**
    - executeUserInterventionStep() implementation
    - Blocking flow execution on pending intervention
    - Resuming flow execution after response
    - Timeout handling in flow execution

2. **Real-time Updates**
    - Wire useRealtimeRefresh in frontend
    - Subscribe to B2F_INTERVENTION_CREATED events
    - Subscribe to B2F_INTERVENTION_ANSWERED events
    - Auto-refresh list on new interventions

3. **LLM Agent Tool**
    - UserInterventionTool class
    - Register with agent runtime
    - Allow agents to request interventions programmatically

4. **TaskManager Integration**
    - Update task status to AWAITING_USER
    - Track activeInterventionId in Task
    - Update interventionHistory array
    - Resume task after intervention answered

## Quick Verification Checklist

Run these commands to verify the system:

```bash
# 1. Check TypeScript compilation
npm run check

# 2. Verify storage directory exists
ls -la .agent-fleet/data/interventions/ 2>/dev/null || echo "Directory will be created on first intervention"

# 3. Check backend routes
curl http://localhost:3000/api/ | jq '.routes' | grep interventions

# 4. Test API endpoint
curl http://localhost:3000/api/interventions/ | jq

# 5. Verify frontend can compile
cd packages/web-frontend && npm run build

# 6. Check navigation item exists
grep -r "interventions" packages/web-frontend/src/app/components/navigation/
```

## Troubleshooting

### API Returns Empty List

**Problem**: GET /api/interventions/ returns `{"items": [], ...}`

**Solution**:

- Create test intervention using InterventionManager
- Check storage directory: `.agent-fleet/data/interventions/`
- Verify orchestrator is running in library mode

### Frontend Shows "Failed to load interventions"

**Problem**: Console shows API error

**Solution**:

- Verify backend is running on port 3000
- Check browser network tab for 404/500 errors
- Verify API base URL in config

### Intervention Not Appearing in UI

**Problem**: Created intervention via API but doesn't show in UI

**Solution**:

- Check status filter (only "pending" shown by default)
- Refresh the page (real-time updates not yet wired)
- Verify intervention status in storage file

## Next Steps for Full E2E Testing

Once flow executor integration is complete:

1. Create a flow YAML with user_intervention step
2. Submit task to execute the flow
3. Verify intervention appears in UI
4. Respond via UI
5. Verify flow execution continues
6. Check task completes successfully

Example flow YAML:

```yaml
id: test-intervention-flow
name: Test User Intervention Flow
description: Flow to test user interventions

inputs:
    - name: test_input
      type: string

steps:
    - id: ask_approval
      type: user_intervention
      interventionType: approval
      approval:
          title: 'Approve Test Flow Execution'
          description: 'The flow wants to continue. Do you approve?'
          allowReject: true
      blocking: true

    - id: after_approval
      type: script
      dependsOn: [ask_approval]
      script: |
          console.log('User approved!');
          return { approved: true };

outputs:
    - name: result
      value: '{{ steps.after_approval.approved }}'
```

## Conclusion

The User Interventions system is **ready for testing** with all core infrastructure in place. The system is fully type-safe, has complete CRUD operations, and provides a working UI for users to respond to intervention requests.

Manual testing can begin immediately using the InterventionManager API. Full end-to-end automated testing will be possible once the flow executor integration is completed.

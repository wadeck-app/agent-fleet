import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { StateEvent } from 'shared-orch-worker/StateManager';

import type { Worker } from '@app/shared/api/workers.contract';
import {
	B2F_TASKS_UPDATED,
	B2F_TASK_TRACE_UPDATED,
	B2F_WORKERS_UPDATED,
	B2F_WORKER_CONNECTED,
	B2F_WORKER_DISCONNECTED,
	B2F_WORKSPACES_UPDATED,
} from '@app/shared/transport';

import type { EventBroadcaster } from '../transport/EventBroadcaster';

/**
 * ===========================================================================================
 * ORCHESTRATOR EVENT BRIDGE
 * ===========================================================================================
 *
 * Bridges orchestrator StateManager events to Backend-to-Frontend (B2F) events.
 *
 * Responsibilities:
 * - Listen to orchestrator StateEvent emissions
 * - Transform orchestrator events to B2F events
 * - Broadcast B2F events via EventBroadcaster
 * - Handle worker lifecycle events (connect/disconnect)
 * - Handle task lifecycle events (created/updated/deleted)
 *
 * Event Mapping:
 * - StateEvent.WORKER_CONNECTED    → B2F_WORKER_CONNECTED + B2F_WORKERS_UPDATED
 * - StateEvent.WORKER_DISCONNECTED → B2F_WORKER_DISCONNECTED + B2F_WORKERS_UPDATED
 * - StateEvent.WORKER_TASK_ASSIGNED → B2F_WORKERS_UPDATED (worker state changed)
 * - StateEvent.TASK_CREATED        → B2F_TASKS_UPDATED
 * - StateEvent.TASK_UPDATED        → B2F_TASKS_UPDATED
 * - StateEvent.TASK_DELETED        → B2F_TASKS_UPDATED
 *
 * Note on aggregate events:
 * - B2F_TASKS_UPDATED and B2F_WORKERS_UPDATED are broadcast with empty payloads
 * - These act as invalidation signals for the frontend to refresh cached data
 * - The frontend uses useRealtimeRefresh hook which calls refresh() on these events
 * - This pattern avoids fetching full data sets on every orchestrator state change
 *
 * Usage:
 * ```typescript
 * const bridge = new OrchestratorEventBridge(orchestratorWrapper, eventBroadcaster);
 * bridge.start(); // Start listening to orchestrator events
 * // ... later ...
 * bridge.stop(); // Stop listening (e.g., on server shutdown)
 * ```
 *
 * ===========================================================================================
 */
export class OrchestratorEventBridge {
	private isStarted = false;

	constructor(
		private readonly orchestratorWrapper: OrchestratorWrapper,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Start listening to orchestrator events and broadcasting to frontend
	 */
	start(): void {
		if (this.isStarted) {
			console.log('[OrchestratorEventBridge] Already started, skipping');
			return;
		}

		try {
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			if (!orchestrator) {
				console.error('[OrchestratorEventBridge] Orchestrator not available, cannot start bridge');
				return;
			}

			const stateManager = orchestrator.getTaskManager().getStateManager();

			// Worker connected
			stateManager.on(StateEvent.WORKER_CONNECTED, (data: { worker: any }) => {
				console.log('[OrchestratorEventBridge] WORKER_CONNECTED:', data.worker?.id);

				const worker = this.transformWorker(data.worker);

				// Emit specific event
				this.eventBroadcaster.broadcast(B2F_WORKER_CONNECTED, worker);

				// Emit aggregate event for dashboard (used as invalidation signal by frontend)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_WORKERS_UPDATED, {} as any);

				// Emit workspaces updated event (new worker = new workspace potentially)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {} as any);
			});

			// Worker disconnected
			stateManager.on(StateEvent.WORKER_DISCONNECTED, (data: { workerId: string }) => {
				console.log('[OrchestratorEventBridge] WORKER_DISCONNECTED:', data.workerId);

				// Emit specific event
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_WORKER_DISCONNECTED, { workerId: data.workerId } as any);

				// Emit aggregate event for dashboard (used as invalidation signal by frontend)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_WORKERS_UPDATED, {} as any);

				// Emit workspaces updated event (worker disconnected = workspace may disappear)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {} as any);
			});

			// Worker task assigned (worker state changed)
			stateManager.on(StateEvent.WORKER_TASK_ASSIGNED, (data: { workerId: string; taskId: string }) => {
				console.log('[OrchestratorEventBridge] WORKER_TASK_ASSIGNED:', data.workerId, data.taskId);

				// Emit aggregate event - dashboard needs to know worker states changed (invalidation signal)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_WORKERS_UPDATED, {} as any);
			});

			// Task events (aggregate only - specific task events are emitted by TasksService)
			stateManager.on(StateEvent.TASK_CREATED, () => {
				console.log('[OrchestratorEventBridge] TASK_CREATED');
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);
			});

			stateManager.on(StateEvent.TASK_UPDATED, () => {
				console.log('[OrchestratorEventBridge] TASK_UPDATED');
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);
			});

			stateManager.on(StateEvent.TASK_DELETED, () => {
				console.log('[OrchestratorEventBridge] TASK_DELETED');
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_TASKS_UPDATED, {} as any);
			});

			// Task trace updated (real-time log streaming)
			// Emitted every ~500ms during task execution with incremental trace updates
			// Filtered by taskId on subscription to avoid spamming all clients
			stateManager.on(StateEvent.TASK_TRACE_UPDATED, (eventData: { taskId: string; stepsCount: number }) => {
				console.log('[OrchestratorEventBridge] TASK_TRACE_UPDATED:', eventData.taskId, eventData.stepsCount);
				// Broadcast with taskId for filtering
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_TASK_TRACE_UPDATED, eventData as any);
			});

			this.isStarted = true;
			console.log('[OrchestratorEventBridge] Started listening to orchestrator events');
		} catch (error) {
			console.error('[OrchestratorEventBridge] Failed to start:', error);
		}
	}

	/**
	 * Stop listening to orchestrator events
	 */
	stop(): void {
		if (!this.isStarted) {
			return;
		}

		try {
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			if (!orchestrator) {
				return;
			}

			const stateManager = orchestrator.getTaskManager().getStateManager();
			stateManager.removeAllListeners(StateEvent.WORKER_CONNECTED);
			stateManager.removeAllListeners(StateEvent.WORKER_DISCONNECTED);
			stateManager.removeAllListeners(StateEvent.WORKER_TASK_ASSIGNED);
			stateManager.removeAllListeners(StateEvent.TASK_CREATED);
			stateManager.removeAllListeners(StateEvent.TASK_UPDATED);
			stateManager.removeAllListeners(StateEvent.TASK_DELETED);
			stateManager.removeAllListeners(StateEvent.TASK_TRACE_UPDATED);

			this.isStarted = false;
			console.log('[OrchestratorEventBridge] Stopped listening to orchestrator events');
		} catch (error) {
			console.error('[OrchestratorEventBridge] Failed to stop:', error);
		}
	}

	/**
	 * Transform orchestrator worker info to frontend Worker format
	 */
	private transformWorker(worker: any): Worker {
		return {
			workerId: worker.id,
			name: undefined, // Name comes from WorkersRepository metadata
			version: undefined, // Version comes from WorkersRepository metadata
			connected: true,
			taskId: worker.taskId ?? undefined,
			state: worker.taskId ? 'busy' : 'idle',
			uptime: undefined,
			lastHeartbeat: undefined,
			tasksCompleted: undefined,
			successRate: undefined,
		};
	}
}

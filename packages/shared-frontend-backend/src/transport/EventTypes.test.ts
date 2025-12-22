import type { Task as _Task } from '../api/tasks.contract';
import type { Worker as _Worker } from '../api/workers.contract';
import type { Workspace as _Workspace } from '../api/workspaces.contract';
import type {
	EventData,
	EventType,
	EventsForResource,
	ResourceName,
	CrudEventType as _CrudEventType,
} from './EventTypes';

describe('EventTypes', () => {
	describe('Type Inference', () => {
		it('should infer correct type for task:created', () => {
			type TaskCreatedData = EventData<'task:created'>;

			// This should be typed as Task
			const data: TaskCreatedData = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'high',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedWorker: null,
			};

			expect(data.id).toBe('task-1');
			expect(data.status).toBe('todo');
		});

		it('should infer correct type for worker:heartbeat', () => {
			type HeartbeatData = EventData<'worker:heartbeat'>;

			const data: HeartbeatData = {
				workerId: 'worker-1',
				timestamp: Date.now(),
				status: 'idle',
			};

			expect(data.workerId).toBe('worker-1');
			expect(typeof data.timestamp).toBe('number');
		});

		it('should infer correct type for workspace:quota_exceeded', () => {
			type QuotaExceededData = EventData<'workspace:quota_exceeded'>;

			const data: QuotaExceededData = {
				workspaceId: 'ws-1',
				quotaType: 'storage',
				usage: 1024,
				limit: 1000,
			};

			expect(data.workspaceId).toBe('ws-1');
			expect(data.usage).toBeGreaterThan(data.limit);
		});
	});

	describe('CRUD Events', () => {
		it('should include all CRUD event types for tasks', () => {
			const taskEvents: EventType[] = ['task:created', 'task:updated', 'task:deleted', 'task:status_changed'];

			taskEvents.forEach(event => {
				expect(typeof event).toBe('string');
			});
		});

		it('should include all CRUD event types for workers', () => {
			const workerEvents: EventType[] = [
				'worker:created',
				'worker:updated',
				'worker:deleted',
				'worker:status_changed',
			];

			workerEvents.forEach(event => {
				expect(typeof event).toBe('string');
			});
		});

		it('should include all CRUD event types for workspaces', () => {
			const workspaceEvents: EventType[] = [
				'workspace:created',
				'workspace:updated',
				'workspace:deleted',
				'workspace:status_changed',
			];

			workspaceEvents.forEach(event => {
				expect(typeof event).toBe('string');
			});
		});
	});

	describe('Business Events', () => {
		it('should include task:assigned event', () => {
			type TaskAssignedData = EventData<'task:assigned'>;

			const data: TaskAssignedData = {
				taskId: 'task-1',
				workerId: 'worker-1',
				assignedAt: Date.now(),
			};

			expect(data.taskId).toBe('task-1');
			expect(data.workerId).toBe('worker-1');
			expect(typeof data.assignedAt).toBe('number');
		});

		it('should include task:priority_changed event', () => {
			type PriorityChangedData = EventData<'task:priority_changed'>;

			const data: PriorityChangedData = {
				taskId: 'task-1',
				oldPriority: 1,
				newPriority: 5,
			};

			expect(data.oldPriority).toBeLessThan(data.newPriority);
		});

		it('should include worker:capacity_changed event', () => {
			type CapacityChangedData = EventData<'worker:capacity_changed'>;

			const data: CapacityChangedData = {
				workerId: 'worker-1',
				capacity: 10,
			};

			expect(data.capacity).toBe(10);
		});

		it('should include workspace:archived event', () => {
			type ArchivedData = EventData<'workspace:archived'>;

			const data: ArchivedData = {
				workspaceId: 'ws-1',
				archivedAt: Date.now(),
			};

			expect(typeof data.archivedAt).toBe('number');
		});
	});

	describe('Event Filtering', () => {
		it('should filter task events', () => {
			type TaskEventType = EventsForResource<'task'>;

			const taskEvents: TaskEventType[] = [
				'task:created',
				'task:updated',
				'task:deleted',
				'task:status_changed',
				'task:assigned',
				'task:priority_changed',
			];

			expect(taskEvents).toHaveLength(6);
		});

		it('should filter worker events', () => {
			type WorkerEventType = EventsForResource<'worker'>;

			const workerEvents: WorkerEventType[] = [
				'worker:created',
				'worker:updated',
				'worker:deleted',
				'worker:status_changed',
				'worker:heartbeat',
				'worker:capacity_changed',
			];

			expect(workerEvents).toHaveLength(6);
		});

		it('should filter workspace events', () => {
			type WorkspaceEventType = EventsForResource<'workspace'>;

			const workspaceEvents: WorkspaceEventType[] = [
				'workspace:created',
				'workspace:updated',
				'workspace:deleted',
				'workspace:status_changed',
				'workspace:quota_exceeded',
				'workspace:archived',
			];

			expect(workspaceEvents).toHaveLength(6);
		});
	});

	describe('Resource Name Extraction', () => {
		it('should extract resource name from event type', () => {
			type TaskResource = ResourceName<'task:created'>;
			type WorkerResource = ResourceName<'worker:heartbeat'>;
			type WorkspaceResource = ResourceName<'workspace:archived'>;

			const taskResource: TaskResource = 'task';
			const workerResource: WorkerResource = 'worker';
			const workspaceResource: WorkspaceResource = 'workspace';

			expect(taskResource).toBe('task');
			expect(workerResource).toBe('worker');
			expect(workspaceResource).toBe('workspace');
		});
	});

	describe('Type Safety', () => {
		it('should prevent invalid event types at compile time', () => {
			// Valid event types
			const validEvents: EventType[] = ['task:created', 'worker:heartbeat', 'workspace:quota_exceeded'];

			// TypeScript will catch invalid event types at compile time
			// @ts-expect-error - Invalid event type
			const _invalidEvent: EventType = 'invalid:event';

			expect(validEvents).toHaveLength(3);
		});

		it('should ensure correct data types for events', () => {
			// Task event should have Task data
			type TaskCreatedData = EventData<'task:created'>;
			const taskData: TaskCreatedData = {
				id: 'task-1',
				description: 'Test',
				status: 'todo',
				priority: 'high',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				assignedWorker: null,
			};

			// Business event should have specific structure
			type HeartbeatData = EventData<'worker:heartbeat'>;
			const heartbeatData: HeartbeatData = {
				workerId: 'worker-1',
				timestamp: Date.now(),
				status: 'idle',
			};

			expect(taskData.id).toBe('task-1');
			expect(heartbeatData.workerId).toBe('worker-1');
		});
	});

	describe('Event Subscription Patterns', () => {
		it('should support single event subscription', () => {
			const subscription: EventType = 'task:created';
			expect(subscription).toBe('task:created');
		});

		it('should support multiple event subscription', () => {
			const subscriptions: EventType[] = ['task:created', 'task:updated', 'task:deleted'];
			expect(subscriptions).toHaveLength(3);
		});

		it('should support resource-specific subscriptions', () => {
			type TaskEvents = EventsForResource<'task'>;
			const taskSubscriptions: TaskEvents[] = [
				'task:created',
				'task:updated',
				'task:deleted',
				'task:status_changed',
				'task:assigned',
				'task:priority_changed',
			];
			expect(taskSubscriptions.length).toBeGreaterThan(0);
		});

		it('should support mixed subscription patterns', () => {
			const mixedSubscriptions: EventType[] = [
				// Task CRUD
				'task:created',
				'task:updated',
				// Worker business events
				'worker:heartbeat',
				'worker:capacity_changed',
				// Workspace alerts
				'workspace:quota_exceeded',
			];
			expect(mixedSubscriptions).toHaveLength(5);
		});
	});
});

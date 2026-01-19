/**
 * Main export for orchestrator package
 *
 * Provides the Orchestrator class for library mode usage.
 */
export { Orchestrator } from './core/Orchestrator';
export { BackendEventBridge } from './core/BackendEventBridge';
export type {
	BackendEventType,
	BackendEventData,
	BackendEventHandler,
	WorkerConnectedEvent,
	WorkerDisconnectedEvent,
	TaskAssignedEvent,
	TaskStartedEvent,
	TaskTraceUpdateEvent,
	InterventionRequestedEvent,
	TaskCompletedEvent,
} from './core/BackendEventBridge';

// violations-suppress: ts/no-barrel-index public API entry point for workspace package — 11 import sites
/**
 * Main export for orchestrator package
 *
 * Provides the Orchestrator class for library mode usage.
 */
export { Orchestrator } from './core/Orchestrator';
export { BackendEventBridge } from './core/BackendEventBridge';
export { TraceChunkStorage } from './core/TraceChunkStorage';
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
export type { ChunkMetadata, TraceMetadata, TraceChunk } from './core/TraceChunkStorage';

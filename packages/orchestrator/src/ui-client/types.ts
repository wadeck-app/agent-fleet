/**
 * UI Protocol Types
 *
 * This file defines the WebSocket protocol between Orchestrator and Web UI.
 * This protocol is COMPLETELY SEPARATE from the worker protocol (src/shared/types.ts).
 *
 * Key principle: Strong typing for reusability in the backend UI server.
 */

import type { Task, WorkerInfo } from 'shared-common/types.js';
import type { OrchestratorStatusData, MetricsData } from 'shared-common/StateManager.js';

/**
 * Message types for UI ↔ Orchestrator communication
 */
export enum UIMessageType {
  // ============================================
  // UI → Orchestrator (Commands)
  // ============================================

  /** Initial connection request from UI */
  CONNECT = 'ui_connect',

  /** Graceful disconnection */
  DISCONNECT = 'ui_disconnect',

  /** Subscribe to specific state events */
  SUBSCRIBE = 'ui_subscribe',

  /** Unsubscribe from state events */
  UNSUBSCRIBE = 'ui_unsubscribe',

  /** Request full state snapshot */
  REQUEST_SNAPSHOT = 'ui_request_snapshot',

  /** Start a flow execution */
  START_FLOW = 'ui_start_flow',

  /** Stop a running flow/task */
  STOP_FLOW = 'ui_stop_flow',

  /** Retry a failed task */
  RETRY_TASK = 'ui_retry_task',

  /** Delete a task */
  DELETE_TASK = 'ui_delete_task',

  /** Get worker details */
  GET_WORKER_INFO = 'ui_get_worker_info',

  /** Disconnect a worker */
  DISCONNECT_WORKER = 'ui_disconnect_worker',

  /** Update orchestrator configuration */
  UPDATE_CONFIG = 'ui_update_config',

  // ============================================
  // Orchestrator → UI (Updates & Responses)
  // ============================================

  /** Connection accepted, welcome message */
  CONNECTED = 'ui_connected',

  /** Full state snapshot response */
  SNAPSHOT = 'ui_snapshot',

  /** State change notification (real-time) */
  STATE_UPDATE = 'ui_state_update',

  /** Command execution result */
  COMMAND_RESULT = 'ui_command_result',

  /** Error notification */
  ERROR = 'ui_error',

  /** Ping for keep-alive */
  PING = 'ui_ping',

  /** Pong response to ping */
  PONG = 'ui_pong'
}

/**
 * Base interface for all UI messages
 */
export interface BaseUIMessage {
  type: UIMessageType;
  timestamp: string;

  /** Optional request ID for tracking request/response pairs */
  requestId?: string;
}

// ============================================
// Command Messages (UI → Orchestrator)
// ============================================

/**
 * Initial connection request
 */
export interface UIConnectMessage extends BaseUIMessage {
  type: UIMessageType.CONNECT;
  authToken: string;
  clientInfo: {
    userAgent?: string;
    version?: string;
    clientId?: string;
  };
}

/**
 * Disconnect request
 */
export interface UIDisconnectMessage extends BaseUIMessage {
  type: UIMessageType.DISCONNECT;
}

/**
 * Subscribe to specific state events
 */
export interface UISubscribeMessage extends BaseUIMessage {
  type: UIMessageType.SUBSCRIBE;
  events: string[]; // List of StateEvent enum values
}

/**
 * Unsubscribe from state events
 */
export interface UIUnsubscribeMessage extends BaseUIMessage {
  type: UIMessageType.UNSUBSCRIBE;
  events: string[]; // List of StateEvent enum values
}

/**
 * Request full state snapshot
 */
export interface UIRequestSnapshotMessage extends BaseUIMessage {
  type: UIMessageType.REQUEST_SNAPSHOT;
}

/**
 * Start a flow execution
 */
export interface UIStartFlowMessage extends BaseUIMessage {
  type: UIMessageType.START_FLOW;
  flowId: string;
  inputs?: Record<string, any>;
  workerId?: string; // Optional: target specific worker
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Stop a running flow/task
 */
export interface UIStopFlowMessage extends BaseUIMessage {
  type: UIMessageType.STOP_FLOW;
  taskId: string;
  reason?: string;
}

/**
 * Retry a failed task
 */
export interface UIRetryTaskMessage extends BaseUIMessage {
  type: UIMessageType.RETRY_TASK;
  taskId: string;
}

/**
 * Delete a task
 */
export interface UIDeleteTaskMessage extends BaseUIMessage {
  type: UIMessageType.DELETE_TASK;
  taskId: string;
}

/**
 * Get worker information
 */
export interface UIGetWorkerInfoMessage extends BaseUIMessage {
  type: UIMessageType.GET_WORKER_INFO;
  workerId?: string; // If omitted, returns all workers
}

/**
 * Disconnect a worker
 */
export interface UIDisconnectWorkerMessage extends BaseUIMessage {
  type: UIMessageType.DISCONNECT_WORKER;
  workerId: string;
  reason?: string;
}

/**
 * Update configuration
 */
export interface UIUpdateConfigMessage extends BaseUIMessage {
  type: UIMessageType.UPDATE_CONFIG;
  config: Record<string, any>;
}

/**
 * Ping message for keep-alive
 */
export interface UIPingMessage extends BaseUIMessage {
  type: UIMessageType.PING;
}

// ============================================
// Response Messages (Orchestrator → UI)
// ============================================

/**
 * Connection accepted response
 */
export interface UIConnectedMessage extends BaseUIMessage {
  type: UIMessageType.CONNECTED;
  orchestratorId: string;
  version: string;
  capabilities: string[]; // List of supported features
}

/**
 * Full state snapshot
 */
export interface UISnapshotMessage extends BaseUIMessage {
  type: UIMessageType.SNAPSHOT;
  snapshot: OrchestratorSnapshot;
}

/**
 * Real-time state update notification
 */
export interface UIStateUpdateMessage extends BaseUIMessage {
  type: UIMessageType.STATE_UPDATE;
  event: string; // StateEvent enum value
  data: any; // Event-specific data
}

/**
 * Command execution result
 */
export interface UICommandResultMessage extends BaseUIMessage {
  type: UIMessageType.COMMAND_RESULT;
  requestId: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Error notification
 */
export interface UIErrorMessage extends BaseUIMessage {
  type: UIMessageType.ERROR;
  error: string;
  details?: any;
  requestId?: string; // If error is related to a specific request
}

/**
 * Pong response to ping
 */
export interface UIPongMessage extends BaseUIMessage {
  type: UIMessageType.PONG;
}

// ============================================
// Union Type for Type Safety
// ============================================

/**
 * Union of all UI message types
 */
export type UIMessage =
  // Commands
  | UIConnectMessage
  | UIDisconnectMessage
  | UISubscribeMessage
  | UIUnsubscribeMessage
  | UIRequestSnapshotMessage
  | UIStartFlowMessage
  | UIStopFlowMessage
  | UIRetryTaskMessage
  | UIDeleteTaskMessage
  | UIGetWorkerInfoMessage
  | UIDisconnectWorkerMessage
  | UIUpdateConfigMessage
  | UIPingMessage
  // Responses
  | UIConnectedMessage
  | UISnapshotMessage
  | UIStateUpdateMessage
  | UICommandResultMessage
  | UIErrorMessage
  | UIPongMessage;

// ============================================
// Data Structures for Snapshot
// ============================================

/**
 * Complete orchestrator state snapshot
 * Sent to UI on connection or on-demand
 */
export interface OrchestratorSnapshot {
  timestamp: string;
  orchestrator: {
    status: 'ready' | 'starting' | 'stopping';
    uptime: number; // milliseconds
    version: string;
  };
  tasks: {
    all: Task[];
    byStatus: Record<string, number>;
    total: number;
  };
  workers: {
    all: WorkerInfo[];
    connected: number;
    idle: number;
    busy: number;
  };
  metrics: MetricsData;
}

// ============================================
// Protocol Helpers
// ============================================

/**
 * Create a UI message with automatic timestamp
 */
export function createUIMessage<T extends UIMessage>(
  type: T['type'],
  data: Omit<T, 'type' | 'timestamp'> | any
): T {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...data
  } as T;
}

/**
 * Parse a UI message from JSON string
 */
export function parseUIMessage(json: string): UIMessage {
  const parsed = JSON.parse(json);

  if (!parsed.type || !Object.values(UIMessageType).includes(parsed.type)) {
    throw new Error(`Invalid UI message type: ${parsed.type}`);
  }

  return parsed as UIMessage;
}

/**
 * Type guard to check if a message is a command (UI → Orchestrator)
 */
export function isUICommand(message: UIMessage): boolean {
  return [
    UIMessageType.CONNECT,
    UIMessageType.DISCONNECT,
    UIMessageType.SUBSCRIBE,
    UIMessageType.UNSUBSCRIBE,
    UIMessageType.REQUEST_SNAPSHOT,
    UIMessageType.START_FLOW,
    UIMessageType.STOP_FLOW,
    UIMessageType.RETRY_TASK,
    UIMessageType.DELETE_TASK,
    UIMessageType.GET_WORKER_INFO,
    UIMessageType.DISCONNECT_WORKER,
    UIMessageType.UPDATE_CONFIG,
    UIMessageType.PING
  ].includes(message.type);
}

/**
 * Type guard to check if a message is a response (Orchestrator → UI)
 */
export function isUIResponse(message: UIMessage): boolean {
  return [
    UIMessageType.CONNECTED,
    UIMessageType.SNAPSHOT,
    UIMessageType.STATE_UPDATE,
    UIMessageType.COMMAND_RESULT,
    UIMessageType.ERROR,
    UIMessageType.PONG
  ].includes(message.type);
}

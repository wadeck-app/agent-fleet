// Shared types for the entire system

export enum TaskStatus {
  BACKLOG = 'backlog',
  REFINING = 'refining',
  REFINED = 'refined',
  PRIORITIZING = 'prioritizing',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  TESTING = 'testing',
  REVIEW = 'review',
  REVIEWING = 'reviewing',
  CHANGES_REQUESTED = 'changes_requested',
  APPROVED = 'approved',
  MERGED = 'merged',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled'
}

export enum WorkerType {
  PM = 'pm',
  PO = 'po',
  DEV = 'dev',
  REVIEWER = 'reviewer'
}

export enum MessageType {
  // Worker → Orchestrator
  WORKER_READY = 'worker_ready',
  WORKER_HEARTBEAT = 'worker_heartbeat',
  TASK_STARTED = 'task_started',
  TASK_PROGRESS = 'task_progress',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_QUESTION = 'task_question',
  FLOWS_UPDATED = 'flows_updated',
  REQUEST_TASK = 'request_task',

  // Flow execution events (Worker → Orchestrator)
  FLOW_STEP_STARTED = 'flow_step_started',
  FLOW_STEP_COMPLETED = 'flow_step_completed',
  FLOW_STEP_FAILED = 'flow_step_failed',

  // Workspace events (Worker → Orchestrator)
  WORKSPACE_ALLOCATED = 'workspace_allocated',
  WORKSPACE_RELEASED = 'workspace_released',

  // Hook → Orchestrator (via Worker)
  /** TODO Depreacated no?*/
  STOP_REQUESTED = 'stop_requested',
  /** TODO Depreacated no?*/
  HOOK_EVENT = 'hook_event',
  /** TODO Depreacated no?*/
  TOOL_RESULT = 'tool_result',

  // Orchestrator → Worker
  WORKER_WELCOME = 'worker_welcome',
  ASSIGN_TASK = 'assign_task',
  KILL_CLAUDE = 'kill_claude',
  PAUSE = 'pause',
  RESUME = 'resume',
  SHUTDOWN = 'shutdown',

  // General
  ACK = 'ack',
  ERROR = 'error'
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
  assignedTo: {
    workerId: string;
    workerType: WorkerType;
  } | null;
  comments: TaskComment[];
  metadata: Record<string, any>;
  history: TaskHistoryEntry[];

  // Flow Engine integration
  flowId?: string;
  flowInputs?: Record<string, any>;
  flowResult?: {
    status: 'completed' | 'failed';
    outputs?: Record<string, any>;
    error?: string;
    trace?: any;
  };

  // Workspace configuration
  workspacePath?: string; // For manual workspace mode
}

export interface TaskComment {
  timestamp: string;
  author: string;
  content: string;
}

export interface TaskHistoryEntry {
  timestamp: string;
  event: string;
  [key: string]: any;
}

export interface BaseMessage {
  type: MessageType;
  timestamp: string;
}

export interface WorkerReadyMessage extends BaseMessage {
  type: MessageType.WORKER_READY;
  workerType: WorkerType;
  preferredId?: string;
  projectId: string;
  workspacePath: string;
  availableFlows: import('../flow/types.js').FlowMetadata[];
}

export interface WorkerHeartbeatMessage extends BaseMessage {
  type: MessageType.WORKER_HEARTBEAT;
  workerId: string;
}

export interface TaskStartedMessage extends BaseMessage {
  type: MessageType.TASK_STARTED;
  workerId: string;
  taskId: string;
  newStatus?: TaskStatus;
}

export interface TaskProgressMessage extends BaseMessage {
  type: MessageType.TASK_PROGRESS;
  workerId: string;
  taskId: string;
  progress: string;
}

export interface TaskCompletedMessage extends BaseMessage {
  type: MessageType.TASK_COMPLETED;
  workerId: string;
  taskId: string;
  newStatus?: TaskStatus;
  result?: any;
}

export interface TaskFailedMessage extends BaseMessage {
  type: MessageType.TASK_FAILED;
  workerId: string;
  taskId: string;
  error: string;
  newStatus?: TaskStatus;
}

export interface TaskQuestionMessage extends BaseMessage {
  type: MessageType.TASK_QUESTION;
  workerId: string;
  taskId: string;
  question: string;
}

export interface StopRequestedMessage extends BaseMessage {
  type: MessageType.STOP_REQUESTED;
  workerId: string;
  taskId: string;
  claudePid: number;
}

export interface HookEventMessage extends BaseMessage {
  type: MessageType.HOOK_EVENT;
  workerId: string;
  hookName: string;
  data: any;
}

export interface FlowStepStartedMessage extends BaseMessage {
  type: MessageType.FLOW_STEP_STARTED;
  workerId: string;
  taskId: string;
  stepId: string;
  stepName?: string;
}

export interface FlowStepCompletedMessage extends BaseMessage {
  type: MessageType.FLOW_STEP_COMPLETED;
  workerId: string;
  taskId: string;
  stepId: string;
  outputs?: Record<string, any>;
}

export interface FlowStepFailedMessage extends BaseMessage {
  type: MessageType.FLOW_STEP_FAILED;
  workerId: string;
  taskId: string;
  stepId: string;
  error: string;
}

export interface WorkspaceAllocatedMessage extends BaseMessage {
  type: MessageType.WORKSPACE_ALLOCATED;
  workerId: string;
  taskId: string;
  workspaceId: string;
  workspacePath: string;
}

export interface WorkspaceReleasedMessage extends BaseMessage {
  type: MessageType.WORKSPACE_RELEASED;
  workerId: string;
  taskId: string;
  workspaceId: string;
}

export interface WorkerWelcomeMessage extends BaseMessage {
  type:MessageType.WORKER_WELCOME;
  workerId: string;
}

export interface AssignTaskMessage extends BaseMessage {
  type: MessageType.ASSIGN_TASK;
  task: Task;
}

export interface KillClaudeMessage extends BaseMessage {
  type: MessageType.KILL_CLAUDE;
  reason: string;
}

export interface PauseMessage extends BaseMessage {
  type: MessageType.PAUSE;
}

export interface ResumeMessage extends BaseMessage {
  type: MessageType.RESUME;
}

export interface ShutdownMessage extends BaseMessage {
  type: MessageType.SHUTDOWN;
}

export interface AckMessage extends BaseMessage {
  type: MessageType.ACK;
  [key: string]: any;
}

export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
}

export interface FlowsUpdatedMessage extends BaseMessage {
  type: MessageType.FLOWS_UPDATED;
  workerId: string;
  projectId: string;
  flows: import('../flow/types.js').FlowMetadata[];
  changes?: {
    added: string[];
    removed: string[];
    updated: string[];
  };
}

export interface RequestTaskMessage extends BaseMessage {
  type: MessageType.REQUEST_TASK;
  workerId: string;
}

export type Message =
  | WorkerReadyMessage
  | WorkerHeartbeatMessage
  | TaskStartedMessage
  | TaskProgressMessage
  | TaskCompletedMessage
  | TaskFailedMessage
  | TaskQuestionMessage
  | FlowStepStartedMessage
  | FlowStepCompletedMessage
  | FlowStepFailedMessage
  | WorkspaceAllocatedMessage
  | WorkspaceReleasedMessage
  | StopRequestedMessage
  | HookEventMessage
  | FlowsUpdatedMessage
  | RequestTaskMessage
// Orchestrator → Worker
  | WorkerWelcomeMessage
  | AssignTaskMessage
  | KillClaudeMessage
  | PauseMessage
  | ResumeMessage
  | ShutdownMessage
  | AckMessage
  | ErrorMessage;

export interface WorkerInfo {
  id: string;
  type: WorkerType;
  taskId: string | null;
  connectedAt: string;
}

export interface OrchestratorStats {
  restPort: number;
  wsPort: number;
  workers: number;
  workersList: WorkerInfo[];
  tasks: {
    total: number;
    byStatus: Record<string, number>;
  };
}

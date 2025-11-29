// Types partagés pour tout le système

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

  // Hook → Orchestrator (via Worker)
  STOP_REQUESTED = 'stop_requested',
  HOOK_EVENT = 'hook_event',
  TOOL_RESULT = 'tool_result',

  // Orchestrator → Worker
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
  workerId: string;
  workerType: WorkerType;
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

export type Message =
  | WorkerReadyMessage
  | WorkerHeartbeatMessage
  | TaskStartedMessage
  | TaskProgressMessage
  | TaskCompletedMessage
  | TaskFailedMessage
  | TaskQuestionMessage
  | StopRequestedMessage
  | HookEventMessage
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

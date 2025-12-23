// Protocol constants and base types for Orchestrator ↔ Worker communication

export enum MessageType {
	// W2O Messages (Worker → Orchestrator)
	WORKER_READY = 'w2o:worker:ready',
	WORKER_HEARTBEAT = 'w2o:worker:heartbeat',
	REQUEST_TASK = 'w2o:task:request',
	TASK_STARTED = 'w2o:task:started',
	TASK_PROGRESS = 'w2o:task:progress',
	TASK_COMPLETED = 'w2o:task:completed',
	TASK_FAILED = 'w2o:task:failed',
	TASK_QUESTION = 'w2o:task:question',
	FLOWS_UPDATED = 'w2o:flows:updated',
	FLOW_STEP_STARTED = 'w2o:flow:step:started',
	FLOW_STEP_COMPLETED = 'w2o:flow:step:completed',
	FLOW_STEP_FAILED = 'w2o:flow:step:failed',
	WORKSPACE_ALLOCATED = 'w2o:workspace:allocated',
	WORKSPACE_RELEASED = 'w2o:workspace:released',

	// Hook → Orchestrator (via Worker) - TODO: Deprecated?
	/** TODO Deprecated no?*/
	STOP_REQUESTED = 'stop_requested',
	/** TODO Deprecated no?*/
	HOOK_EVENT = 'hook_event',
	/** TODO Deprecated no?*/
	TOOL_RESULT = 'tool_result',

	// O2W Messages (Orchestrator → Worker)
	WORKER_WELCOME = 'o2w:worker:welcome',
	ASSIGN_TASK = 'o2w:task:assign',
	KILL_CLAUDE = 'o2w:claude:kill',
	PAUSE = 'o2w:execution:pause',
	RESUME = 'o2w:execution:resume',
	SHUTDOWN = 'o2w:worker:shutdown',
	ACK = 'o2w:ack',
	ERROR = 'o2w:error',
}

export interface BaseMessage {
	type: MessageType;
	timestamp: string;
}

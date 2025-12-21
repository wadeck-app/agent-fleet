// Shared types for FlowWorker UI

export interface UIState {
	workerId: string;
	taskId: string | null;
	flowId: string | null;
	flowName: string | null;
	workspaceDir: string | null;
	orchestratorUrl: string;
	connected: boolean;
	paused: boolean;

	// Flow execution state
	currentStepIndex: number;
	totalSteps: number;
	steps: StepInfo[];

	// Statistics
	startTime: number | null;
	elapsedSeconds: number;
	retryCount: number;
	outputCount: number;
	errorCount: number;
	taskCompleted: boolean;

	// Logs
	logs: LogEntry[];
	maxLogs: number;
}

export interface StepInfo {
	id: string;
	name: string;
	type: 'script' | 'model' | 'subflow';
	status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
	startTime?: number;
	endTime?: number;
	durationMs?: number;
	retryNumber?: number;
	error?: string;
}

export interface LogEntry {
	timestamp: number;
	level: 'info' | 'success' | 'error' | 'warning' | 'debug';
	message: string;
	stepId?: string;
}

export type ViewType = 'split' | 'compact' | 'timeline' | 'fullscreen' | 'sidepanel';

export interface ViewProps {
	state: UIState;
	onViewChange: (view: ViewType) => void;
	currentView: ViewType;
	terminalHeight: number;
	terminalWidth: number;
}

// State manager for FlowWorker UI
import type { LogEntry, StepInfo, UIState } from './types.js';

export class UIStateManager {
	private state: UIState;
	private listeners: Set<(state: UIState) => void> = new Set();

	constructor(workerId: string, orchestratorUrl: string) {
		this.state = {
			workerId,
			taskId: null,
			flowId: null,
			flowName: null,
			workspaceDir: null,
			orchestratorUrl,
			connected: false,
			paused: false,
			currentStepIndex: 0,
			totalSteps: 0,
			steps: [],
			startTime: null,
			elapsedSeconds: 0,
			retryCount: 0,
			outputCount: 0,
			errorCount: 0,
			taskCompleted: false,
			logs: [],
			maxLogs: 100,
		};
	}

	getState(): UIState {
		return { ...this.state };
	}

	subscribe(listener: (state: UIState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		const stateCopy = this.getState();
		this.listeners.forEach(listener => listener(stateCopy));
	}

	// Connection events
	setConnected(connected: boolean): void {
		this.state.connected = connected;
		this.notify();
	}

	setWorkerId(workerId: string): void {
		this.state.workerId = workerId;
		this.notify();
	}

	setPaused(paused: boolean): void {
		this.state.paused = paused;
		this.notify();
	}

	togglePause(): void {
		this.state.paused = !this.state.paused;
		this.notify();
	}

	// Task events
	startTask(taskId: string, flowId: string, flowName: string, steps: StepInfo[]): void {
		this.state.taskId = taskId;
		this.state.flowId = flowId;
		this.state.flowName = flowName;
		this.state.steps = steps;
		this.state.totalSteps = steps.length;
		this.state.currentStepIndex = 0;
		this.state.startTime = Date.now();
		this.state.retryCount = 0;
		this.state.taskCompleted = false;
		this.state.outputCount = 0;
		this.state.errorCount = 0;
		this.addLog('info', `Flow started: ${flowName}`);
		this.notify();
	}

	setWorkspace(workspaceDir: string): void {
		this.state.workspaceDir = workspaceDir;
		this.addLog('info', `Workspace: ${workspaceDir}`);
		this.notify();
	}

	// Step events
	stepStarted(stepId: string, retryNumber?: number): void {
		const step = this.state.steps.find(s => s.id === stepId);
		if (step) {
			step.status = 'running';
			step.startTime = Date.now();
			step.retryNumber = retryNumber;

			this.state.currentStepIndex = this.state.steps.indexOf(step);

			if (retryNumber !== undefined && retryNumber > 0) {
				this.state.retryCount++;
				this.addLog('warning', `Step '${step.name}' started (retry #${retryNumber})`, stepId);
			} else {
				this.addLog('info', `Step '${step.name}' started`, stepId);
			}
		}
		this.notify();
	}

	stepCompleted(stepId: string, durationMs: number): void {
		const step = this.state.steps.find(s => s.id === stepId);
		if (step) {
			step.status = 'completed';
			step.endTime = Date.now();
			step.durationMs = durationMs;
			this.state.outputCount++;
			this.addLog('success', `Step '${step.name}' completed (${(durationMs / 1000).toFixed(1)}s)`, stepId);
		}
		this.notify();
	}

	stepFailed(stepId: string, error: string, durationMs: number): void {
		const step = this.state.steps.find(s => s.id === stepId);
		if (step) {
			step.status = 'failed';
			step.endTime = Date.now();
			step.durationMs = durationMs;
			step.error = error;
			this.state.errorCount++;
			this.addLog('error', `Step '${step.name}' failed (${(durationMs / 1000).toFixed(1)}s)`, stepId);
			this.addLog('error', `  Error: ${error}`, stepId);
		}
		this.notify();
	}

	stepSkipped(stepId: string, reason: string): void {
		const step = this.state.steps.find(s => s.id === stepId);
		if (step) {
			step.status = 'skipped';
			this.addLog('debug', `Step '${step.name}' skipped: ${reason}`, stepId);
		}
		this.notify();
	}

	// Log management
	addLog(level: LogEntry['level'], message: string, stepId?: string): void {
		const log: LogEntry = {
			timestamp: Date.now(),
			level,
			message,
			stepId,
		};

		this.state.logs.push(log);

		// Keep only last maxLogs entries
		if (this.state.logs.length > this.state.maxLogs) {
			this.state.logs = this.state.logs.slice(-this.state.maxLogs);
		}
	}

	addStepOutput(stepId: string, output: string): void {
		// Add step output as logs
		output.split('\n').forEach(line => {
			if (line.trim()) {
				this.addLog('debug', `  ${line}`, stepId);
			}
		});
		this.notify();
	}

	// Update elapsed time (call periodically)
	updateElapsedTime(): void {
		if (this.state.startTime) {
			this.state.elapsedSeconds = Math.floor((Date.now() - this.state.startTime) / 1000);
			this.notify();
		}
	}

	// Task completion
	taskCompleted(): void {
		this.state.taskCompleted = true;
		this.addLog('success', 'Flow execution completed');
		this.notify();
	}

	taskFailed(error: string): void {
		this.state.taskCompleted = true;
		this.addLog('error', `Flow execution failed: ${error}`);
		this.notify();
	}

	reset(): void {
		this.state.taskId = null;
		this.state.flowId = null;
		this.state.flowName = null;
		this.state.workspaceDir = null;
		this.state.steps = [];
		this.state.totalSteps = 0;
		this.state.currentStepIndex = 0;
		this.state.startTime = null;
		this.state.elapsedSeconds = 0;
		this.state.retryCount = 0;
		this.state.outputCount = 0;
		this.state.errorCount = 0;
		this.state.logs = [];
		this.notify();
	}
}

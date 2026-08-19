import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ExecutionState, StepStatus } from '../ipc/Protocol';

export function generateExecutionId(): string {
	const hex = crypto.randomUUID().replace(/-/g, '');
	return parseInt(hex.slice(0, 11), 16).toString(36).padStart(8, '0').slice(-8);
}

const EXECUTION_ID_RE = /^[a-z0-9]{8}$/;

function assertExecutionIdSafe(executionId: string): void {
	if (!EXECUTION_ID_RE.test(executionId)) {
		throw new Error(`Invalid executionId format: ${JSON.stringify(executionId)}`);
	}
}

export class ExecutionStore {
	constructor(
		private readonly executionsDir: string,
		private readonly retainDays: number = 30
	) {}

	pruneOldExecutions(): void {
		let rawFiles: string[];
		try {
			rawFiles = fs.readdirSync(this.executionsDir);
		} catch (err) {
			process.stderr.write(`[ExecutionStore] failed to read executions dir for pruning: ${String(err)}\n`);
			return;
		}
		const files = rawFiles.filter(f => f.endsWith('.json'));
		if (files.length === 0) return;
		const cutoffMs = Date.now() - this.retainDays * 24 * 60 * 60 * 1000;
		for (const file of files) {
			const filePath = path.join(this.executionsDir, file);
			try {
				const content = fs.readFileSync(filePath, 'utf8');
				const state = JSON.parse(content) as ExecutionState;
				const timestamp = state.completedAt ?? state.startedAt;
				const ageMs = new Date(timestamp).getTime();
				if (ageMs < cutoffMs) {
					fs.unlinkSync(filePath);
				}
			} catch {
				// fallback: delete if unreadable and old by mtime
				try {
					const stat = fs.statSync(filePath);
					if (stat.mtimeMs < cutoffMs) fs.unlinkSync(filePath);
				} catch {
					/* ignore */
				}
			}
		}
	}

	create(params: { executionId: string; flowFile: string; flowId: string; stepIds: string[] }): ExecutionState {
		assertExecutionIdSafe(params.executionId);
		const state: ExecutionState = {
			executionId: params.executionId,
			flowFile: params.flowFile,
			flowId: params.flowId,
			status: 'queued',
			currentSteps: [],
			startedAt: new Date().toISOString(),
			completedAt: null,
			steps: Object.fromEntries(params.stepIds.map(id => [id, { status: 'pending' as StepStatus }])),
		};
		this.write(state);
		return state;
	}

	exists(executionId: string): boolean {
		assertExecutionIdSafe(executionId);
		return fs.existsSync(this.filePath(executionId));
	}

	read(executionId: string): ExecutionState {
		assertExecutionIdSafe(executionId);
		const filePath = this.filePath(executionId);
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			return JSON.parse(content) as ExecutionState;
		} catch (err) {
			throw new Error(`Corrupted execution state for ${executionId}: ${String(err)}`);
		}
	}

	update(executionId: string, patch: Partial<ExecutionState>): ExecutionState {
		const current = this.read(executionId);
		const updated = { ...current, ...patch };
		this.write(updated);
		return updated;
	}

	markStepRunning(executionId: string, stepId: string): ExecutionState {
		const state = this.read(executionId);
		// Preserve existing fields (e.g. injected: true) when transitioning to running
		state.steps[stepId] = {
			...state.steps[stepId],
			status: 'running',
			startedAt: new Date().toISOString(),
		};
		if (!state.currentSteps.includes(stepId)) state.currentSteps.push(stepId);
		if (state.status === 'queued') state.status = 'running';
		this.write(state);
		return state;
	}

	markStepCompleted(executionId: string, stepId: string): ExecutionState {
		const state = this.read(executionId);
		const step = state.steps[stepId];
		if (step) {
			step.status = 'completed';
			step.completedAt = new Date().toISOString();
		}
		state.currentSteps = state.currentSteps.filter(id => id !== stepId);
		this.write(state);
		return state;
	}

	markStepFailed(executionId: string, stepId: string, error?: string): ExecutionState {
		const state = this.read(executionId);
		const step = state.steps[stepId];
		if (step) {
			step.status = 'failed';
			step.completedAt = new Date().toISOString();
			if (error !== undefined) step.error = error;
		}
		state.currentSteps = state.currentSteps.filter(id => id !== stepId);
		if (error !== undefined) state.lastError = error;
		this.write(state);
		return state;
	}

	markExecutionCompleted(executionId: string): ExecutionState {
		return this.update(executionId, {
			status: 'completed',
			completedAt: new Date().toISOString(),
			currentSteps: [],
		});
	}

	markExecutionFailed(executionId: string): ExecutionState {
		return this.update(executionId, { status: 'failed', completedAt: new Date().toISOString(), currentSteps: [] });
	}

	private filePath(executionId: string): string {
		return path.join(this.executionsDir, `${executionId}.json`);
	}

	private write(state: ExecutionState): void {
		fs.writeFileSync(this.filePath(state.executionId), JSON.stringify(state, null, 2), 'utf8');
	}
}

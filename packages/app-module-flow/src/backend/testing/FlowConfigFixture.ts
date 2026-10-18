import type { ExecutionRecord } from 'flow-core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A throwaway flow config directory (`executions/`, `logs/`) so tests read real files, not mocks. */
export class FlowConfigFixture {
	readonly configDir: string;

	constructor() {
		this.configDir = mkdtempSync(join(tmpdir(), 'app-module-flow-'));
	}

	addExecution(partial: Partial<ExecutionRecord> & { executionId: string }): ExecutionRecord {
		const record: ExecutionRecord = {
			flowId: 'deploy',
			flowFile: '/flows/deploy.yml',
			status: 'completed',
			currentSteps: [],
			startedAt: '2026-08-16T12:00:00.000Z',
			completedAt: '2026-08-16T12:00:01.000Z',
			steps: {},
			...partial,
		};
		this.addRawExecutionFile(record.executionId, JSON.stringify(record));
		return record;
	}

	addRawExecutionFile(executionId: string, content: string): void {
		mkdirSync(join(this.configDir, 'executions'), { recursive: true });
		writeFileSync(join(this.configDir, 'executions', `${executionId}.json`), content);
	}

	addLog(date: string, lines: string[]): void {
		mkdirSync(join(this.configDir, 'logs'), { recursive: true });
		writeFileSync(join(this.configDir, 'logs', `${date}.ndjson`), lines.join('\n') + '\n');
	}

	dispose(): void {
		rmSync(this.configDir, { recursive: true, force: true });
	}
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executionsDirOf, logsDirOf } from '../config/FlowConfigLayout.js';
import type { ExecutionState } from '../execution/ExecutionState.js';
import { makeExec } from './makeExec.js';

/** A throwaway flow config directory (`executions/`, `logs/`) so tests read real files, not mocks. */
export class FlowConfigFixture {
	readonly configDir: string;

	/**
	 * @param label names the temp directory, so a leftover one can be traced to the suite that made it
	 * @param configDir an existing location to fill (e.g. `<XDG_CONFIG_HOME>/flow` for a real server) instead of a new temp directory
	 */
	constructor(label = 'flow-config', configDir?: string) {
		this.configDir = configDir ?? mkdtempSync(join(tmpdir(), `${label}-`));
	}

	/** Writes `<executionId>.json`; the record is {@link makeExec}'s completed `deploy` run with `partial` applied. */
	addExecution(partial: Partial<ExecutionState> & { executionId: string }): ExecutionState {
		const record = makeExec({ flowId: 'deploy', flowFile: '/flows/deploy.yml', ...partial });
		this.addRawExecutionFile(record.executionId, JSON.stringify(record));
		return record;
	}

	/** Writes `<executionId>.json` with `content` as is, for damaged or hand-made records. */
	addRawExecutionFile(executionId: string, content: string): void {
		const dir = executionsDirOf(this.configDir);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${executionId}.json`), content);
	}

	addLog(date: string, lines: string[]): void {
		const dir = logsDirOf(this.configDir);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${date}.ndjson`), lines.join('\n') + '\n');
	}

	dispose(): void {
		rmSync(this.configDir, { recursive: true, force: true });
	}
}

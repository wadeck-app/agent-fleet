import fs from 'node:fs';
import path from 'node:path';

import { RunSandboxName } from './RunSandboxName';
import { SandboxError } from './SandboxError';

/** What a wrapper tells the outside world about itself. */
export interface PresencePublisher {
	/** The wrapper process is up and currently holds `executionId` (or no run). */
	publish(wrapperId: string, executionId: string | undefined): void;
	/** The wrapper is shutting down. */
	withdraw(wrapperId: string): void;
}

/** Answers "is this still in use?" for the removal command. */
export interface LiveRunCheck {
	isWrapperAlive(wrapperId: string): boolean;
	isRunAlive(executionId: string): boolean;
}

interface PresenceRecord {
	wrapperId: string;
	pid: number;
	executionId: string | undefined;
}

const WRAPPER_FILE = /^([a-z0-9]{1,12})\.json$/;

/**
 * File-based presence: one `<wrapperId>.json` per wrapper in a directory, holding its pid and current run.
 * A wrapper is alive when its file exists and its pid is a live process; a run is alive when a live wrapper
 * holds it. A crashed wrapper leaves a file with a dead pid: it counts as not alive. Limit: a recycled pid
 * makes a dead wrapper look alive (the removal is refused, the safe direction; delete the file to override).
 */
export class WrapperPresence implements PresencePublisher, LiveRunCheck {
	constructor(
		private readonly directory: string,
		private readonly isProcessAlive: (pid: number) => boolean,
		private readonly ownPid: number
	) {
		if (!path.isAbsolute(directory)) {
			throw new SandboxError(
				'invalid-argument',
				`The presence directory must be an absolute path, got "${directory}".`
			);
		}
	}

	publish(wrapperId: string, executionId: string | undefined): void {
		fs.mkdirSync(this.directory, { recursive: true });
		const record: PresenceRecord = { wrapperId, pid: this.ownPid, executionId };
		const target = this.fileOf(wrapperId);
		const temporary = `${target}.${this.ownPid}.tmp`;
		fs.writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
		fs.renameSync(temporary, target);
	}

	withdraw(wrapperId: string): void {
		fs.rmSync(this.fileOf(wrapperId), { force: true });
	}

	isWrapperAlive(wrapperId: string): boolean {
		const record = this.read(this.fileOf(wrapperId));
		return record !== undefined && this.isProcessAlive(record.pid);
	}

	isRunAlive(executionId: string): boolean {
		if (!fs.existsSync(this.directory)) return false;
		return fs
			.readdirSync(this.directory)
			.filter(file => WRAPPER_FILE.test(file))
			.some(file => {
				const record = this.read(path.join(this.directory, file));
				return record?.executionId === executionId && this.isProcessAlive(record.pid);
			});
	}

	private fileOf(wrapperId: string): string {
		if (!RunSandboxName.isWrapperId(wrapperId)) {
			throw new SandboxError(
				'invalid-argument',
				`Wrapper id ${JSON.stringify(wrapperId)} is not valid: 1 to 12 lowercase letters or digits.`
			);
		}
		return path.join(this.directory, `${wrapperId}.json`);
	}

	private read(file: string): PresenceRecord | undefined {
		let text: string;
		try {
			text = fs.readFileSync(file, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
			throw error;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			throw new SandboxError(
				'output-unparsable',
				`The presence file ${file} is not valid JSON. Delete it if no wrapper uses it, then retry.`,
				{ cause: error }
			);
		}
		const record = parsed as Partial<PresenceRecord> | null;
		if (
			record === null ||
			typeof record !== 'object' ||
			typeof record.wrapperId !== 'string' ||
			typeof record.pid !== 'number' ||
			!Number.isInteger(record.pid) ||
			(record.executionId !== undefined && typeof record.executionId !== 'string')
		) {
			throw new SandboxError(
				'output-unparsable',
				`The presence file ${file} has an unexpected shape. Delete it if no wrapper uses it, then retry.`
			);
		}
		return { wrapperId: record.wrapperId, pid: record.pid, executionId: record.executionId };
	}
}

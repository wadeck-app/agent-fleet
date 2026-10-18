import { NtStatusDescriber } from './NtStatusDescriber';
import type { ProcessCountResult } from './WindowsProcessCounter';
import { WindowsProcessCounter } from './WindowsProcessCounter';

export interface ScriptFailureInfo {
	exitCode: number;
	shellPath?: string;
	workingDir?: string;
}

const NOT_REPORTED = 'unknown (not reported by the executor)';

/**
 * Builds the `error` text of a failed script step. Ordinary exit codes and non-Windows platforms
 * keep the historical `Script exited with code N`; a Windows NTSTATUS gets hex, symbolic name,
 * shell, cwd and (for 0xC0000142 only) a hint plus the leaked-process counts.
 */
export class ScriptFailureMessageBuilder {
	constructor(
		private readonly platform: NodeJS.Platform = process.platform,
		private readonly processCounter: { count(): Promise<ProcessCountResult> } = new WindowsProcessCounter()
	) {}

	async build(info: ScriptFailureInfo): Promise<string> {
		const base = `Script exited with code ${info.exitCode}`;
		if (this.platform !== 'win32' || !NtStatusDescriber.isNtStatus(info.exitCode)) return base;

		const lines = [
			`${base} (${NtStatusDescriber.format(info.exitCode)})`,
			`Shell: ${info.shellPath ?? NOT_REPORTED}`,
			`Cwd: ${info.workingDir ?? NOT_REPORTED}`,
		];
		const hint = NtStatusDescriber.hint(info.exitCode);
		if (hint) {
			lines.push(`Hint: ${hint}`);
			const counts = await this.processCounter.count();
			lines.push(
				counts.ok
					? `Process counts: ${Object.entries(counts.counts)
							.map(([image, n]) => `${image}=${n}`)
							.join(', ')}`
					: `Process counts: unavailable (${counts.error})`
			);
		}
		return lines.join('\n');
	}
}

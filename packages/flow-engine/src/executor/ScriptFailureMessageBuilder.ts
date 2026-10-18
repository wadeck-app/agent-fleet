import { NtStatusDescriber } from './NtStatusDescriber';
import type { ProcessCountResult } from './WindowsProcessCounter';
import { WindowsProcessCounter } from './WindowsProcessCounter';
import { BashInvocation } from './shell/BashInvocation';

export interface ScriptFailureInfo {
	exitCode: number;
	shellPath?: string;
	workingDir?: string;
	/** Rendered script text; lets the strict hint be skipped for a deliberate `exit N`. */
	script?: string;
	/** Script stderr; "unbound variable" always keeps the strict hint. */
	stderr?: string;
	/** True when the step ran under bash strict mode (-e -u); adds the opt-out hint. */
	strictApplied?: boolean;
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
		const message = await this.buildBase(info);
		return info.strictApplied && this.strictMayHaveCausedFailure(info)
			? `${message}\n${BashInvocation.STRICT_FAILURE_HINT}`
			: message;
	}

	/**
	 * False when the script itself says `exit <code>` and bash reported no unbound variable: the
	 * failure is then deliberate and the hint would point at a shell problem that did not happen.
	 * Unknown script text keeps the hint.
	 */
	private strictMayHaveCausedFailure(info: ScriptFailureInfo): boolean {
		if (info.script === undefined) return true;
		if (/unbound variable/i.test(info.stderr ?? '')) return true;
		const deliberateExit = new RegExp(`(^|[;&|(\\s])exit\\s+${info.exitCode}(\\s|;|$)`, 'm');
		return !deliberateExit.test(info.script);
	}

	private async buildBase(info: ScriptFailureInfo): Promise<string> {
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

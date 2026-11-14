import type { HostTool, HostToolCwd } from 'flow-engine';
import { HostToolSchemaLimits } from 'flow-engine';

/** What applies to one host tool once the defaults are filled in. */
export interface ResolvedHostToolLimits {
	cwd: HostToolCwd;
	timeoutSeconds: number;
	maxOutputBytes: number;
	/** Calls of this tool that may run at the same time. */
	concurrency: number;
	/** Calls allowed per step, all tools together. */
	maxCallsPerStep: number;
}

/**
 * The defaults of the `hostTools` limits, applied where a tool is used (the runner, `flow show`), so what is displayed is
 * what is applied. They are NOT written into the step definition: the schema only validates the maxima
 * (flow-engine `HostToolSchemaLimits`), and stores what the author wrote.
 */
export class HostToolLimits {
	static readonly DEFAULTS: Readonly<ResolvedHostToolLimits> = {
		cwd: 'workspace',
		timeoutSeconds: 30,
		maxOutputBytes: 65_536,
		concurrency: 2,
		maxCallsPerStep: 100,
	};

	/**
	 * @throws when the tool carries a limit above the schema maximum or not a positive integer. Validation refuses such a
	 *         tool before it reaches a worker, so this is the guard for a path that skipped it; the message names the tool.
	 */
	static resolve(tool: HostTool): ResolvedHostToolLimits {
		HostToolLimits.assertInRange(tool, 'timeoutSeconds', HostToolSchemaLimits.MAX_TIMEOUT_SECONDS);
		HostToolLimits.assertInRange(tool, 'maxOutputBytes', HostToolSchemaLimits.MAX_OUTPUT_BYTES);
		return {
			...HostToolLimits.DEFAULTS,
			...(tool.cwd === undefined ? {} : { cwd: tool.cwd }),
			...(tool.timeoutSeconds === undefined ? {} : { timeoutSeconds: tool.timeoutSeconds }),
			...(tool.maxOutputBytes === undefined ? {} : { maxOutputBytes: tool.maxOutputBytes }),
		};
	}

	/** One line for `flow show`: the applied values, with `(default)` where the tool wrote nothing. */
	static describe(tool: HostTool): string {
		const resolved = HostToolLimits.resolve(tool);
		const mark = (written: unknown): string => (written === undefined ? ' (default)' : '');
		return [
			`cwd=${resolved.cwd}${mark(tool.cwd)}`,
			`timeout=${resolved.timeoutSeconds}s${mark(tool.timeoutSeconds)}`,
			`output<=${resolved.maxOutputBytes} bytes${mark(tool.maxOutputBytes)}`,
		].join(', ');
	}

	private static assertInRange(tool: HostTool, field: 'timeoutSeconds' | 'maxOutputBytes', max: number): void {
		const value = tool[field];
		if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > max)) {
			throw new Error(
				`Host tool '${tool.id}': ${field} is ${String(value)}, it must be an integer between 1 and ${max}. Fix: correct the step definition (flow validate reports it).`
			);
		}
	}
}

import type { HostTool } from 'flow-engine';

// The same grammar as the static validator (flow-engine HostToolCommandValidator): a whole element, or `--flag=` plus one.
const WHOLE_PLACEHOLDER = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;
const FLAG_PLACEHOLDER = /^(--[A-Za-z0-9][A-Za-z0-9-]*)=\{([A-Za-z][A-Za-z0-9_]*)\}$/;
const EMBEDDED_PLACEHOLDER = /\{[A-Za-z][A-Za-z0-9_]*\}/;

/**
 * Builds the argv of one call: `command[1..]` with each `{name}` replaced by the checked value, and nothing else. No
 * shell, no globbing, no splitting, no second substitution pass: a value is ONE argv element (or the value of one
 * `--flag=`), whatever characters it holds. An optional argument the model did not give drops its element.
 */
export class HostToolArgv {
	/** @returns the arguments after the executable. */
	static build(tool: HostTool, values: Readonly<Record<string, string>>): string[] {
		const argv: string[] = [];
		for (const element of tool.command.slice(1)) {
			const whole = WHOLE_PLACEHOLDER.exec(element);
			if (whole !== null) {
				const value = HostToolArgv.valueOf(values, whole[1]!);
				if (value !== undefined) argv.push(value);
				continue;
			}
			const flag = FLAG_PLACEHOLDER.exec(element);
			if (flag !== null) {
				const value = HostToolArgv.valueOf(values, flag[2]!);
				if (value !== undefined) argv.push(`${flag[1]!}=${value}`);
				continue;
			}
			if (EMBEDDED_PLACEHOLDER.test(element)) {
				throw new Error(
					`Host tool '${tool.id}': command element '${element}' is not a literal, a whole placeholder or a --flag=placeholder. Fix: correct the step definition (flow validate reports it).`
				);
			}
			argv.push(element);
		}
		return argv;
	}

	private static valueOf(values: Readonly<Record<string, string>>, name: string): string | undefined {
		return Object.hasOwn(values, name) ? values[name] : undefined;
	}
}

import { isRecord } from 'shared-common/utils/isRecord';

import { HostToolSchemaLimits } from './HostToolSchemaLimits';
import type { HostTool, HostToolArg } from './HostToolTypes';
import { NearestName } from './NearestName';

/** Result of checking the arguments of one call: the values to put in the argv (all strings), or why the call is refused. */
export type HostToolCallCheck = { ok: true; values: Readonly<Record<string, string>> } | { ok: false; message: string };

/**
 * Checks the arguments a model passes in one call against the schema the tool declared (the host does it per call, never
 * trusting the list the VM was shown). Pure: no I/O. The caller builds the argv from `values`.
 *
 * Rules: every argument must be declared; required ones present; a string must match its pattern as a WHOLE; an enum value
 * must be listed; an integer must be in range; a value that starts with `-` is refused unless the argument says
 * `allowLeadingDash: true` (it would be read as an option by the tool). The messages are written for the model: they name
 * the argument and the rule so that it can correct the call.
 */
export class HostToolCallChecker {
	static check(tool: HostTool, args: unknown): HostToolCallCheck {
		const given = args === undefined ? {} : args;
		if (!isRecord(given)) {
			return HostToolCallChecker.refuse(tool, 'the arguments must be an object of named values');
		}
		const declared = tool.args ?? {};
		const record = given;
		for (const key of Object.keys(record)) {
			if (!Object.hasOwn(declared, key)) {
				const names = Object.keys(declared);
				const near = NearestName.of(key, names);
				return HostToolCallChecker.refuse(
					tool,
					`unknown argument '${key}'.${near === undefined ? '' : ` Did you mean '${near}'?`} ${names.length === 0 ? 'This tool takes no arguments' : `Accepted arguments: ${names.join(', ')}`}`
				);
			}
		}
		const values: Record<string, string> = {};
		for (const [name, definition] of Object.entries(declared)) {
			const value = record[name];
			if (value === undefined) {
				if (definition.required === true) {
					return HostToolCallChecker.refuse(tool, `argument '${name}' is required`);
				}
				continue;
			}
			const text = HostToolCallChecker.render(name, definition, value);
			if (typeof text !== 'string') {
				return HostToolCallChecker.refuse(tool, text.problem);
			}
			if (text.startsWith('-') && definition.allowLeadingDash !== true) {
				return HostToolCallChecker.refuse(
					tool,
					`argument '${name}' starts with '-', which the tool would read as an option; send a value that does not start with '-'`
				);
			}
			values[name] = text;
		}
		return { ok: true, values };
	}

	private static refuse(tool: HostTool, problem: string): HostToolCallCheck {
		return { ok: false, message: `Tool '${tool.id}' was not run: ${problem}.` };
	}

	/** The value as the string that goes into the argv, or the problem with it. */
	private static render(name: string, definition: HostToolArg, value: unknown): string | { problem: string } {
		switch (definition.type) {
			case 'string':
				return HostToolCallChecker.renderString(name, definition.pattern, value);
			case 'enum':
				if (typeof value === 'string' && definition.values.includes(value)) {
					return value;
				}
				return { problem: `argument '${name}' must be one of: ${definition.values.join(', ')}` };
			case 'integer':
				if (
					typeof value === 'number' &&
					Number.isInteger(value) &&
					value >= definition.min &&
					value <= definition.max
				) {
					return String(value);
				}
				return {
					problem: `argument '${name}' must be an integer between ${definition.min} and ${definition.max}`,
				};
			case 'boolean':
				return typeof value === 'boolean'
					? String(value)
					: { problem: `argument '${name}' must be true or false` };
			default:
				throw new Error(`Unhandled host tool argument type '${(definition as { type: string }).type}'`);
		}
	}

	private static renderString(name: string, pattern: string, value: unknown): string | { problem: string } {
		if (typeof value !== 'string') {
			return { problem: `argument '${name}' must be a string` };
		}
		if (value.length > HostToolSchemaLimits.MAX_VALUE_LENGTH) {
			return { problem: `argument '${name}' is longer than ${HostToolSchemaLimits.MAX_VALUE_LENGTH} characters` };
		}
		if (value.includes('\u0000')) {
			return { problem: `argument '${name}' contains a NUL character` };
		}
		let expression: RegExp;
		try {
			expression = new RegExp(pattern);
		} catch {
			return { problem: `argument '${name}' cannot be checked: its pattern is not a valid regular expression` };
		}
		const match = expression.exec(value);
		// The pattern is anchored by validation, but the whole value must be the match even for an alternation such as ^a|b$.
		if (match === null || match.index !== 0 || match[0].length !== value.length) {
			return { problem: `argument '${name}' does not match the pattern ${pattern}` };
		}
		return value;
	}
}

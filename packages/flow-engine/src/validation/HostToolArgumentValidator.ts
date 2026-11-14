import { HostToolSchemaLimits } from '../hosttools/HostToolSchemaLimits';
import { HOST_TOOL_ARG_TYPES } from '../hosttools/HostToolTypes';
import { NearestName } from '../hosttools/NearestName';
import type { HostToolIssueReporter } from './HostToolIssueReporter';
import { ValidationCode } from './ValidationTypes';

/** An argument name is also a `{name}` placeholder, so it must be a plain identifier. */
export const HOST_TOOL_ARG_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

const COMMON_KEYS = ['type', 'description', 'required', 'log', 'allowLeadingDash'];
const TYPE_KEYS: Readonly<Record<string, readonly string[]>> = {
	enum: ['values'],
	string: ['pattern'],
	integer: ['min', 'max'],
	boolean: [],
};
const SENSITIVE_NAME = /token|secret|passw|credential/i;
const NO_PATTERN_FIX =
	"add 'pattern: ^[A-Za-z0-9_-]{1,64}$' (a pattern that matches the whole value) or use 'type: enum'";
const DASH_FIX = 'remove the value, or set allowLeadingDash: true on this argument if the tool really expects it';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks the `args` of one host tool: closed set of typed arguments (an enum, a string with a mandatory pattern, an integer
 * with bounds, or a boolean). A free-form string is refused: the pattern is what keeps a steered model inside the shapes the author
 * meant.
 */
export class HostToolArgumentValidator {
	/**
	 * @returns the names of the arguments declared with a usable name, so the command check can tell an undeclared
	 *          placeholder from a declared one even when the definition has another problem.
	 */
	validate(args: unknown, reporter: HostToolIssueReporter): Set<string> {
		const declared = new Set<string>();
		if (args === undefined) {
			return declared;
		}
		if (!isPlainObject(args)) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				'args',
				'args must be an object that maps each argument name to its definition',
				'write args as a mapping, for example args: { id: { type: string, pattern: "^[a-z0-9-]+$" } }'
			);
			return declared;
		}
		for (const [name, definition] of Object.entries(args)) {
			if (!HOST_TOOL_ARG_NAME.test(name)) {
				reporter.error(
					ValidationCode.HOST_TOOL_INVALID_ARG,
					`args.${name}`,
					`argument name '${name}' is not an identifier (letters, digits and '_', starting with a letter)`,
					'rename the argument, for example to a camelCase name'
				);
				continue;
			}
			declared.add(name);
			this.validateArgument(name, definition, reporter);
		}
		return declared;
	}

	private validateArgument(name: string, definition: unknown, reporter: HostToolIssueReporter): void {
		const field = `args.${name}`;
		if (!isPlainObject(definition)) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				field,
				`argument '${name}' must be an object with at least a type`,
				`write ${name}: { type: string, pattern: "^[a-z0-9-]+$" }, or another type among ${HOST_TOOL_ARG_TYPES.join(', ')}`
			);
			return;
		}
		const type = definition['type'];
		if (typeof type !== 'string' || !(HOST_TOOL_ARG_TYPES as readonly string[]).includes(type)) {
			this.reportUnknownType(name, type, field, reporter);
			return;
		}
		this.checkKeys(name, type, definition, field, reporter);
		for (const flag of ['required', 'log', 'allowLeadingDash']) {
			if (definition[flag] !== undefined && typeof definition[flag] !== 'boolean') {
				reporter.error(
					ValidationCode.HOST_TOOL_INVALID_ARG,
					`${field}.${flag}`,
					`argument '${name}': ${flag} must be a boolean (true or false)`,
					`write ${flag}: true or ${flag}: false`
				);
			}
		}
		if (definition['description'] !== undefined && typeof definition['description'] !== 'string') {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				`${field}.description`,
				`argument '${name}': description must be a string`,
				'write the description as text'
			);
		}
		const allowDash = definition['allowLeadingDash'] === true;
		switch (type) {
			case 'enum':
				this.checkEnum(name, definition, allowDash, field, reporter);
				break;
			case 'string':
				this.checkString(name, definition, field, reporter);
				break;
			case 'integer':
				this.checkInteger(name, definition, allowDash, field, reporter);
				break;
			case 'boolean':
				break;
			default:
				throw new Error(`Unhandled host tool argument type '${type}'`);
		}
		if (definition['log'] === true && SENSITIVE_NAME.test(name)) {
			reporter.warning(
				ValidationCode.HOST_TOOL_LOG_SENSITIVE,
				`${field}.log`,
				`argument '${name}' has log: true but its name looks like a credential: the audit log would keep its value`,
				`remove log: true from '${name}' (the log then keeps only its name and a hash)`
			);
		}
	}

	private reportUnknownType(name: string, type: unknown, field: string, reporter: HostToolIssueReporter): void {
		const accepted = HOST_TOOL_ARG_TYPES.join(', ');
		if (type === undefined) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				field,
				`argument '${name}' has no type (accepted: ${accepted})`,
				`add a type to '${name}', for example type: string with a pattern`
			);
			return;
		}
		const near = typeof type === 'string' ? NearestName.of(type, HOST_TOOL_ARG_TYPES) : undefined;
		reporter.error(
			ValidationCode.HOST_TOOL_INVALID_ARG,
			`${field}.type`,
			`argument '${name}' has the type ${typeof type === 'string' ? `'${type}'` : JSON.stringify(type)}, which is not one of ${accepted}`,
			near === undefined ? `use one of ${accepted}` : `Did you mean '${near}'? Accepted types: ${accepted}`
		);
	}

	private checkKeys(
		name: string,
		type: string,
		definition: Record<string, unknown>,
		field: string,
		reporter: HostToolIssueReporter
	): void {
		const allowed = [...COMMON_KEYS, ...(TYPE_KEYS[type] ?? [])];
		for (const key of Object.keys(definition)) {
			if (allowed.includes(key)) {
				continue;
			}
			const ownerType = Object.keys(TYPE_KEYS).find(candidate => TYPE_KEYS[candidate]!.includes(key));
			const near = NearestName.of(key, allowed);
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				`${field}.${key}`,
				ownerType === undefined
					? `argument '${name}' has an unknown key '${key}'`
					: `argument '${name}' has the key '${key}', which belongs to type ${ownerType}, not to type ${type}`,
				near === undefined
					? `remove '${key}'; the keys of a ${type} argument are ${allowed.join(', ')}`
					: `Did you mean '${near}'? The keys of a ${type} argument are ${allowed.join(', ')}`
			);
		}
	}

	private checkEnum(
		name: string,
		definition: Record<string, unknown>,
		allowDash: boolean,
		field: string,
		reporter: HostToolIssueReporter
	): void {
		const values = definition['values'];
		if (
			!Array.isArray(values) ||
			values.length === 0 ||
			values.some(value => typeof value !== 'string' || value === '')
		) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				`${field}.values`,
				`argument '${name}' is an enum and needs 'values': a non-empty list of non-empty strings`,
				`write values: [open, done]`
			);
			return;
		}
		const seen = new Set<string>();
		for (const value of values as string[]) {
			if (seen.has(value)) {
				reporter.error(
					ValidationCode.HOST_TOOL_INVALID_ARG,
					`${field}.values`,
					`argument '${name}' lists the value '${value}' twice (duplicate)`,
					`remove the duplicate '${value}'`
				);
			}
			seen.add(value);
			if (value.startsWith('-') && !allowDash) {
				reporter.error(
					ValidationCode.HOST_TOOL_ARG_LEADING_DASH,
					`${field}.values`,
					`argument '${name}' has the enum value '${value}', which starts with '-' and would be read as an option`,
					DASH_FIX
				);
			}
		}
	}

	private checkString(
		name: string,
		definition: Record<string, unknown>,
		field: string,
		reporter: HostToolIssueReporter
	): void {
		const pattern = definition['pattern'];
		if (pattern === undefined || pattern === '') {
			reporter.error(
				ValidationCode.HOST_TOOL_ARG_NO_PATTERN,
				`${field}.pattern`,
				`argument '${name}' has no pattern: a free-form string would let the model choose any text`,
				NO_PATTERN_FIX
			);
			return;
		}
		if (typeof pattern !== 'string') {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				`${field}.pattern`,
				`argument '${name}': pattern must be a string`,
				'write the pattern as a quoted string'
			);
			return;
		}
		const problem = HostToolArgumentValidator.patternProblem(pattern);
		if (problem !== undefined) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				`${field}.pattern`,
				`argument '${name}': ${problem.problem}`,
				problem.fix
			);
		}
	}

	/** What is wrong with a pattern source, or undefined. Shared rule: the whole value must match, so it must be anchored. */
	static patternProblem(pattern: string): { problem: string; fix: string } | undefined {
		if (pattern.length > HostToolSchemaLimits.MAX_PATTERN_LENGTH) {
			return {
				problem: `pattern is ${pattern.length} characters, the limit is ${HostToolSchemaLimits.MAX_PATTERN_LENGTH}`,
				fix: 'shorten the pattern, or use type: enum for a closed set of values',
			};
		}
		if (!pattern.startsWith('^')) {
			return {
				problem: `pattern '${pattern}' is not anchored: it must start with '^'`,
				fix: `write the pattern as ^...$ so that it matches the whole value`,
			};
		}
		if (!HostToolArgumentValidator.endsWithAnchor(pattern)) {
			return {
				problem: `pattern '${pattern}' is not anchored: it must end with '$'`,
				fix: `write the pattern as ^...$ so that it matches the whole value`,
			};
		}
		try {
			new RegExp(pattern);
		} catch (error) {
			return {
				problem: `pattern '${pattern}' is not a valid regular expression (${(error as Error).message})`,
				fix: 'correct the regular expression (JavaScript syntax)',
			};
		}
		return undefined;
	}

	/** True when the last `$` is an anchor, not an escaped literal (`\$`). */
	private static endsWithAnchor(pattern: string): boolean {
		if (!pattern.endsWith('$')) {
			return false;
		}
		let backslashes = 0;
		for (let index = pattern.length - 2; index >= 0 && pattern[index] === '\\'; index--) {
			backslashes++;
		}
		return backslashes % 2 === 0;
	}

	private checkInteger(
		name: string,
		definition: Record<string, unknown>,
		allowDash: boolean,
		field: string,
		reporter: HostToolIssueReporter
	): void {
		const { min, max } = definition;
		if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				field,
				`argument '${name}' is an integer and needs bounds: min and max must both be integers`,
				'write min: 1 and max: 50 (a bound is what keeps the model inside a safe range)'
			);
			return;
		}
		if ((min as number) > (max as number)) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ARG,
				field,
				`argument '${name}' has min ${String(min)} above max ${String(max)}`,
				'swap the bounds'
			);
			return;
		}
		if ((min as number) < 0 && !allowDash) {
			reporter.error(
				ValidationCode.HOST_TOOL_ARG_LEADING_DASH,
				field,
				`argument '${name}' accepts negative numbers (min ${String(min)}), which start with '-' and would be read as an option`,
				`set min: 0, or ${DASH_FIX}`
			);
		}
	}
}

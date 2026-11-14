import { NearestName } from '../hosttools/NearestName';
import type { HostToolIssueReporter } from './HostToolIssueReporter';
import { ValidationCode } from './ValidationTypes';

const WHOLE_PLACEHOLDER = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;
const FLAG_PLACEHOLDER = /^--[A-Za-z0-9][A-Za-z0-9-]*=\{([A-Za-z][A-Za-z0-9_]*)\}$/;
const PLACEHOLDER_FIX =
	'write the placeholder as a whole element ("{id}") or as the value of a flag ("--id={id}"), and put any other text in separate elements';
const COMMAND_FIX = 'write command as an argv array, for example command: [task, show, "{id}", --json]';

/**
 * Checks the `command` of one host tool: an argv array, never a shell string; `{name}` placeholders only as a whole
 * element or as the value of `--flag={name}`; every placeholder declared in `args`; no flow template anywhere (a template
 * is computed from inputs or step outputs and could inject arguments, so the argv is fixed by the definition).
 */
export class HostToolCommandValidator {
	/**
	 * @param declaredArgs names of the arguments the tool declares
	 * @returns the names of the arguments the command uses
	 */
	validate(command: unknown, declaredArgs: ReadonlySet<string>, reporter: HostToolIssueReporter): Set<string> {
		const used = new Set<string>();
		if (command === undefined) {
			reporter.error(ValidationCode.HOST_TOOL_INVALID_COMMAND, 'command', 'command is required', COMMAND_FIX);
			return used;
		}
		if (typeof command === 'string') {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_COMMAND,
				'command',
				`command is a string (${JSON.stringify(command)}), but a host tool runs an argv array, never a shell string`,
				COMMAND_FIX
			);
			return used;
		}
		if (!Array.isArray(command) || command.length === 0) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_COMMAND,
				'command',
				'command must be a non-empty argv array',
				COMMAND_FIX
			);
			return used;
		}
		command.forEach((element: unknown, index) =>
			this.validateElement(element, index, declaredArgs, used, reporter)
		);
		return used;
	}

	private validateElement(
		element: unknown,
		index: number,
		declaredArgs: ReadonlySet<string>,
		used: Set<string>,
		reporter: HostToolIssueReporter
	): void {
		const field = `command[${index}]`;
		if (typeof element !== 'string') {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_COMMAND,
				field,
				`command element ${index} is not a string (${JSON.stringify(element)})`,
				'write every argv element as a string; quote numbers and booleans'
			);
			return;
		}
		if (index === 0 && element === '') {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_COMMAND,
				field,
				'command element 0 (the executable) is empty',
				'put the name of the executable first, for example task'
			);
			return;
		}
		if (element.includes('{{')) {
			reporter.error(
				ValidationCode.HOST_TOOL_TEMPLATE_IN_COMMAND,
				field,
				`command element ${index} contains a flow template (${JSON.stringify(element)}): templates are refused in command because a computed value could inject arguments`,
				'declare an argument in args and write its {name} placeholder; the executable and the fixed words stay literal'
			);
			return;
		}
		if (!element.includes('{') && !element.includes('}')) {
			return;
		}
		if (index === 0) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
				field,
				`command element 0 (the executable) cannot contain a placeholder (${JSON.stringify(element)}): the model never chooses what runs`,
				'write the executable as a literal name'
			);
			return;
		}
		const name = WHOLE_PLACEHOLDER.exec(element)?.[1] ?? FLAG_PLACEHOLDER.exec(element)?.[1];
		if (name === undefined) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
				field,
				`command element ${index} (${JSON.stringify(element)}) mixes a placeholder with other text: a {name} placeholder must be a whole element or the value of --flag={name}`,
				PLACEHOLDER_FIX
			);
			return;
		}
		used.add(name);
		if (!declaredArgs.has(name)) {
			const near = NearestName.of(name, [...declaredArgs]);
			reporter.error(
				ValidationCode.HOST_TOOL_UNDECLARED_PLACEHOLDER,
				field,
				`command element ${index} uses the placeholder '${name}', which is not declared in args`,
				near === undefined
					? `declare '${name}' in args with a type, or correct the placeholder`
					: `Did you mean '${near}'? Otherwise declare '${name}' in args with a type`
			);
		}
	}
}

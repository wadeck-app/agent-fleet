import { HostToolModelView } from '../hosttools/HostToolModelView';
import { HostToolSchemaLimits } from '../hosttools/HostToolSchemaLimits';
import type { HostTool } from '../hosttools/HostToolTypes';
import { NearestName } from '../hosttools/NearestName';
import type { FlowStep } from '../types';
import { HostToolArgumentValidator } from './HostToolArgumentValidator';
import { HostToolCommandValidator } from './HostToolCommandValidator';
import { HostToolEnvValidator } from './HostToolEnvValidator';
import { HostToolIssueReporter } from './HostToolIssueReporter';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

const TOOL_ID = /^[a-z0-9-]+$/;
const TOOL_KEYS = [
	'id',
	'description',
	'sideEffect',
	'command',
	'args',
	'cwd',
	'env',
	'timeoutSeconds',
	'maxOutputBytes',
];
const SIDE_EFFECTS = ['read', 'write'];
const CWD_VALUES = ['workspace', 'none'];

/**
 * Static validation of the `hostTools` of a model step (`flow validate`, and every path that loads a flow): the shape of
 * each tool, its ids, command, arguments, limits, and the size of what the model will be shown. The environment, command
 * and argument rules live in their own classes; this one orchestrates and checks the tool-level fields.
 *
 * Every message names the step, the tool, the rule and a fix. The confinement finding (hostTools under a confined
 * profile) is {@link HostToolsConfinementValidator}, which needs the flow and a policy.
 */
export class HostToolValidator {
	private readonly commands = new HostToolCommandValidator();
	private readonly argumentsValidator = new HostToolArgumentValidator();
	private readonly environment = new HostToolEnvValidator();

	constructor(private readonly issueCollector: IssueCollector) {}

	validateStep(step: FlowStep): void {
		const raw = step as unknown as { id?: unknown; type?: unknown; hostTools?: unknown };
		if (raw.hostTools === undefined || typeof raw.id !== 'string') {
			return;
		}
		const reporter = HostToolIssueReporter.forStep(this.issueCollector, raw.id);
		if (raw.type !== 'model') {
			reporter.error(
				ValidationCode.HOST_TOOL_STEP_TYPE,
				undefined,
				`hostTools is not allowed on a ${String(raw.type)} step: only model steps can call tools`,
				`remove hostTools from '${raw.id}', or turn it into a model step`
			);
			return;
		}
		const tools: unknown = raw.hostTools;
		if (!Array.isArray(tools) || tools.length === 0) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_SHAPE,
				undefined,
				'hostTools must be a list with at least one tool',
				'write hostTools: [{ id: ..., description: ..., sideEffect: read, command: [...] }], or remove the field'
			);
			return;
		}
		if (tools.length > HostToolSchemaLimits.MAX_TOOLS_PER_STEP) {
			reporter.error(
				ValidationCode.HOST_TOOL_TOO_MANY,
				undefined,
				`${tools.length} host tools declared, the limit is ${HostToolSchemaLimits.MAX_TOOLS_PER_STEP}`,
				'declare fewer tools, or split the work across steps'
			);
		}
		const seen = new Set<string>();
		tools.forEach((tool: unknown, index) => this.validateTool(tool, index, seen, reporter));
		// The size is only meaningful for definitions that are well formed: the other errors are shown first.
		if (reporter.errorCount === 0) {
			this.validateDescriptionSize(tools as HostTool[], reporter);
		}
	}

	private validateTool(tool: unknown, index: number, seen: Set<string>, stepReporter: HostToolIssueReporter): void {
		const fields =
			typeof tool === 'object' && tool !== null && !Array.isArray(tool)
				? (tool as Record<string, unknown>)
				: undefined;
		const reporter = stepReporter.forTool(index, fields?.['id']);
		if (fields === undefined) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_SHAPE,
				undefined,
				`hostTools entry ${index + 1} is not an object`,
				'write each tool as an object with id, description, sideEffect and command'
			);
			return;
		}
		this.validateKeys(fields, reporter);
		this.validateId(fields['id'], seen, reporter);
		this.validateDescription(fields['description'], reporter);
		this.validateSideEffect(fields['sideEffect'], reporter);
		const declared = this.argumentsValidator.validate(fields['args'], reporter);
		const used = this.commands.validate(fields['command'], declared, reporter);
		for (const name of declared) {
			if (!used.has(name)) {
				reporter.warning(
					ValidationCode.HOST_TOOL_UNUSED_ARG,
					`args.${name}`,
					`argument '${name}' is declared but the command never uses it, so the model's value is ignored`,
					`write {${name}} in command, or remove '${name}' from args`
				);
			}
		}
		this.validateCwd(fields['cwd'], reporter);
		this.environment.validate(fields['env'], reporter);
		this.validateLimit(
			fields['timeoutSeconds'],
			'timeoutSeconds',
			HostToolSchemaLimits.MAX_TIMEOUT_SECONDS,
			reporter
		);
		this.validateLimit(fields['maxOutputBytes'], 'maxOutputBytes', HostToolSchemaLimits.MAX_OUTPUT_BYTES, reporter);
	}

	private validateKeys(fields: Record<string, unknown>, reporter: HostToolIssueReporter): void {
		for (const key of Object.keys(fields)) {
			if (TOOL_KEYS.includes(key)) {
				continue;
			}
			const near = NearestName.of(key, TOOL_KEYS);
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_SHAPE,
				key,
				`unknown key '${key}'`,
				near === undefined
					? `remove '${key}'; the keys of a host tool are ${TOOL_KEYS.join(', ')}`
					: `Did you mean '${near}'? The keys of a host tool are ${TOOL_KEYS.join(', ')}`
			);
		}
	}

	private validateId(id: unknown, seen: Set<string>, reporter: HostToolIssueReporter): void {
		if (id === HostToolSchemaLimits.RESERVED_TOOL_ID) {
			reporter.error(
				ValidationCode.HOST_TOOL_RESERVED_ID,
				'id',
				`id '${HostToolSchemaLimits.RESERVED_TOOL_ID}' is the engine's own tool (it adds steps to the run)`,
				'choose another id'
			);
			return;
		}
		if (typeof id !== 'string' || !TOOL_ID.test(id)) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_ID,
				'id',
				`id ${JSON.stringify(id)} is not valid: it must match [a-z0-9-]+ (lowercase letters, digits and '-')`,
				'write an id such as queue-task-show'
			);
			return;
		}
		if (seen.has(id)) {
			reporter.error(
				ValidationCode.HOST_TOOL_DUPLICATE_ID,
				'id',
				`id '${id}' is used by more than one tool: ids must be unique in the step`,
				'rename one of them'
			);
		}
		seen.add(id);
	}

	private validateDescription(description: unknown, reporter: HostToolIssueReporter): void {
		if (typeof description !== 'string' || description.trim() === '') {
			reporter.error(
				ValidationCode.HOST_TOOL_MISSING_DESCRIPTION,
				'description',
				'description is required and must be a non-empty string: it is what the model reads to choose the tool',
				'say what the tool does and what it returns'
			);
		}
	}

	private validateSideEffect(sideEffect: unknown, reporter: HostToolIssueReporter): void {
		if (sideEffect === 'read') {
			return;
		}
		if (sideEffect === 'write') {
			reporter.error(
				ValidationCode.HOST_TOOL_WRITE_UNSUPPORTED,
				'sideEffect',
				'sideEffect: write is not supported yet (slice 3); use read',
				'set sideEffect: read and keep the tool to commands that only read'
			);
			return;
		}
		if (sideEffect === undefined) {
			reporter.error(
				ValidationCode.HOST_TOOL_INVALID_SIDE_EFFECT,
				'sideEffect',
				'sideEffect is required (there is no default)',
				"add 'sideEffect: read'"
			);
			return;
		}
		const near = typeof sideEffect === 'string' ? NearestName.of(sideEffect, SIDE_EFFECTS) : undefined;
		reporter.error(
			ValidationCode.HOST_TOOL_INVALID_SIDE_EFFECT,
			'sideEffect',
			`sideEffect ${JSON.stringify(sideEffect)} is not valid (accepted: read)`,
			near === undefined ? 'use sideEffect: read' : `Did you mean '${near}'? Only read is accepted for now`
		);
	}

	private validateCwd(cwd: unknown, reporter: HostToolIssueReporter): void {
		if (cwd === undefined || (typeof cwd === 'string' && CWD_VALUES.includes(cwd))) {
			return;
		}
		reporter.error(
			ValidationCode.HOST_TOOL_INVALID_CWD,
			'cwd',
			`cwd ${JSON.stringify(cwd)} is not accepted: arbitrary paths are not allowed`,
			`use cwd: ${CWD_VALUES.join(' or cwd: ')}`
		);
	}

	private validateLimit(value: unknown, field: string, max: number, reporter: HostToolIssueReporter): void {
		if (value === undefined) {
			return;
		}
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
			reporter.error(
				ValidationCode.HOST_TOOL_LIMIT_EXCEEDED,
				field,
				`${field} must be an integer between 1 and ${max}, got ${JSON.stringify(value)}`,
				`write ${field}: <integer up to ${max}>, or remove it to use the default`
			);
		}
	}

	private validateDescriptionSize(tools: readonly HostTool[], reporter: HostToolIssueReporter): void {
		const bytes = HostToolModelView.byteLength(tools);
		if (bytes > HostToolSchemaLimits.MAX_DESCRIPTION_SET_BYTES) {
			reporter.error(
				ValidationCode.HOST_TOOL_DESCRIPTION_TOO_LARGE,
				undefined,
				`host tools description is ${bytes} bytes, the limit is ${HostToolSchemaLimits.MAX_DESCRIPTION_SET_BYTES}`,
				'shorten descriptions or declare fewer tools'
			);
		}
	}
}

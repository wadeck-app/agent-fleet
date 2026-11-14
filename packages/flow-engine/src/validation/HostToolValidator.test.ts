import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { describe, expect, it } from 'vitest';

import type { FlowStep } from '../types';
import { HostToolValidator } from './HostToolValidator';
import type { ValidationIssue } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

type Raw = Record<string, unknown>;

const ID_ARG = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', required: true };

function tool(extra: Raw = {}): Raw {
	return {
		id: 'queue-task-show',
		description: 'Show a task of the queue by id (read only).',
		sideEffect: 'read',
		command: ['task', 'show', '{id}', '--json'],
		args: { id: ID_ARG },
		...extra,
	};
}

function modelStep(hostTools: unknown, extra: Raw = {}): FlowStep {
	return { id: 's', type: 'model', name: 's', prompt: 'p', hostTools, ...extra } as unknown as FlowStep;
}

function issuesOf(step: FlowStep): ValidationIssue[] {
	const collector = new MockIssueCollector();
	new HostToolValidator(collector).validateStep(step);
	return collector.issues;
}

function errorsOf(step: FlowStep): ValidationIssue[] {
	return issuesOf(step).filter(issue => issue.severity === 'error');
}

describe('HostToolValidator - accepted definitions', () => {
	it('says nothing for a step without hostTools', () => {
		expect(issuesOf({ id: 's', type: 'model', name: 's', prompt: 'p' } as unknown as FlowStep)).toEqual([]);
	});

	it('accepts the documented example, with every optional field', () => {
		const full = tool({
			args: {
				id: ID_ARG,
				status: { type: 'enum', values: ['open', 'done'] },
				limit: { type: 'integer', min: 1, max: 50 },
				verbose: { type: 'boolean' },
			},
			command: ['task', 'show', '{id}', '--status={status}', '--limit={limit}', '{verbose}'],
			cwd: 'none',
			env: ['TASK_PROFILE'],
			timeoutSeconds: 300,
			maxOutputBytes: 1_048_576,
		});
		expect(issuesOf(modelStep([full]))).toEqual([]);
	});

	it('accepts a tool without args (a fixed argv)', () => {
		expect(issuesOf(modelStep([tool({ args: undefined, command: ['task', 'list'] })]))).toEqual([]);
	});

	it('accepts a leading-dash value only when allowLeadingDash is explicit', () => {
		const args = { mode: { type: 'enum', values: ['-v', 'plain'], allowLeadingDash: true } };
		expect(issuesOf(modelStep([tool({ args, command: ['task', '{mode}'] })]))).toEqual([]);
	});
});

describe('HostToolValidator - the error contract', () => {
	// [label, step, code, fragments that the message must contain]
	const cases: [string, FlowStep, ValidationCode, string[]][] = [
		[
			'hostTools on a script step',
			{ id: 's', type: 'script', name: 's', script: 'ls', hostTools: [tool()] } as unknown as FlowStep,
			ValidationCode.HOST_TOOL_STEP_TYPE,
			["Step 's'", 'script', 'model'],
		],
		[
			'hostTools that is not a list (a string)',
			modelStep('task'),
			ValidationCode.HOST_TOOL_INVALID_SHAPE,
			['list'],
		],
		[
			'hostTools that is not a list (an object)',
			modelStep(tool()),
			ValidationCode.HOST_TOOL_INVALID_SHAPE,
			['list'],
		],
		['an empty hostTools list', modelStep([]), ValidationCode.HOST_TOOL_INVALID_SHAPE, ['at least one']],
		['a tool that is not an object', modelStep(['task']), ValidationCode.HOST_TOOL_INVALID_SHAPE, ['object']],
		[
			'a misspelled tool key',
			modelStep([tool({ commnad: ['x'] })]),
			ValidationCode.HOST_TOOL_INVALID_SHAPE,
			["'commnad'", "Did you mean 'command'"],
		],
		[
			'a shell key the schema does not know',
			modelStep([tool({ shell: 'bash' })]),
			ValidationCode.HOST_TOOL_INVALID_SHAPE,
			["'shell'"],
		],
		[
			'an uppercase id',
			modelStep([tool({ id: 'Queue' })]),
			ValidationCode.HOST_TOOL_INVALID_ID,
			["'Queue'", '[a-z0-9-]'],
		],
		[
			'an id with an underscore',
			modelStep([tool({ id: 'a_b' })]),
			ValidationCode.HOST_TOOL_INVALID_ID,
			['[a-z0-9-]'],
		],
		['an id with a space', modelStep([tool({ id: 'a b' })]), ValidationCode.HOST_TOOL_INVALID_ID, ['[a-z0-9-]']],
		['an empty id', modelStep([tool({ id: '' })]), ValidationCode.HOST_TOOL_INVALID_ID, ['[a-z0-9-]']],
		['a numeric id', modelStep([tool({ id: 7 })]), ValidationCode.HOST_TOOL_INVALID_ID, ['[a-z0-9-]']],
		[
			'the id provideSteps',
			modelStep([tool({ id: 'provideSteps' })]),
			ValidationCode.HOST_TOOL_RESERVED_ID,
			["'provideSteps'", 'engine'],
		],
		[
			'a duplicated id',
			modelStep([tool(), tool()]),
			ValidationCode.HOST_TOOL_DUPLICATE_ID,
			["'queue-task-show'", 'unique'],
		],
		[
			'a missing description',
			modelStep([tool({ description: undefined })]),
			ValidationCode.HOST_TOOL_MISSING_DESCRIPTION,
			['description'],
		],
		[
			'a blank description',
			modelStep([tool({ description: '   ' })]),
			ValidationCode.HOST_TOOL_MISSING_DESCRIPTION,
			['description'],
		],
		[
			'a non-string description',
			modelStep([tool({ description: 4 })]),
			ValidationCode.HOST_TOOL_MISSING_DESCRIPTION,
			['description'],
		],
		[
			'a missing sideEffect',
			modelStep([tool({ sideEffect: undefined })]),
			ValidationCode.HOST_TOOL_INVALID_SIDE_EFFECT,
			['sideEffect', 'required', 'read'],
		],
		[
			'a misspelled sideEffect',
			modelStep([tool({ sideEffect: 'raed' })]),
			ValidationCode.HOST_TOOL_INVALID_SIDE_EFFECT,
			["Did you mean 'read'"],
		],
		[
			'sideEffect write',
			modelStep([tool({ sideEffect: 'write' })]),
			ValidationCode.HOST_TOOL_WRITE_UNSUPPORTED,
			['sideEffect: write is not supported yet (slice 3); use read'],
		],
		[
			'a command written as a shell string',
			modelStep([tool({ command: 'task show {id}' })]),
			ValidationCode.HOST_TOOL_INVALID_COMMAND,
			['argv', 'array', 'string'],
		],
		[
			'a missing command',
			modelStep([tool({ command: undefined })]),
			ValidationCode.HOST_TOOL_INVALID_COMMAND,
			['command'],
		],
		[
			'an empty command',
			modelStep([tool({ command: [] })]),
			ValidationCode.HOST_TOOL_INVALID_COMMAND,
			['non-empty'],
		],
		[
			'a non-string argv element',
			modelStep([tool({ command: ['task', 1] })]),
			ValidationCode.HOST_TOOL_INVALID_COMMAND,
			['element 1'],
		],
		[
			'an empty executable',
			modelStep([tool({ command: ['', '{id}'] })]),
			ValidationCode.HOST_TOOL_INVALID_COMMAND,
			['element 0'],
		],
		[
			'a flow template in an argv element',
			modelStep([tool({ command: ['task', 'show', '${{ inputs.taskId }}'] })]),
			ValidationCode.HOST_TOOL_TEMPLATE_IN_COMMAND,
			['template', 'element 2', '{name}'],
		],
		[
			'a bare double-brace expression in an argv element',
			modelStep([tool({ command: ['task', '{{ steps.a.output }}'] })]),
			ValidationCode.HOST_TOOL_TEMPLATE_IN_COMMAND,
			['template'],
		],
		[
			'a template in the executable',
			modelStep([tool({ command: ['${{ inputs.bin }}', '{id}'] })]),
			ValidationCode.HOST_TOOL_TEMPLATE_IN_COMMAND,
			['element 0'],
		],
		[
			'a placeholder as the executable',
			modelStep([tool({ command: ['{id}', 'show'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['executable', 'element 0'],
		],
		[
			'a placeholder glued to a prefix',
			modelStep([tool({ command: ['task', 'x{id}'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['whole', '--flag={name}'],
		],
		[
			'a placeholder glued to a suffix',
			modelStep([tool({ command: ['task', '{id}x'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['whole'],
		],
		[
			'a placeholder in a shell-looking element (; and $())',
			modelStep([tool({ command: ['task', 'x;{id}', '$({id})'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['whole'],
		],
		[
			'two placeholders in one element',
			modelStep([tool({ command: ['task', '{id}{id}'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['whole'],
		],
		[
			'a placeholder with spaces',
			modelStep([tool({ command: ['task', '{ id }'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['whole'],
		],
		[
			'an empty placeholder',
			modelStep([tool({ command: ['task', '{}'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['whole'],
		],
		[
			'a flag value that continues after the placeholder',
			modelStep([tool({ command: ['task', '--id={id}x'] })]),
			ValidationCode.HOST_TOOL_INVALID_PLACEHOLDER,
			['whole'],
		],
		[
			'a placeholder that is not declared in args',
			modelStep([tool({ command: ['task', 'show', '{idd}'] })]),
			ValidationCode.HOST_TOOL_UNDECLARED_PLACEHOLDER,
			["'idd'", "Did you mean 'id'", 'args'],
		],
		[
			'an undeclared placeholder as a flag value',
			modelStep([tool({ command: ['task', '--id={nope}', '{id}'] })]),
			ValidationCode.HOST_TOOL_UNDECLARED_PLACEHOLDER,
			["'nope'"],
		],
		[
			'a placeholder when the tool declares no args at all',
			modelStep([tool({ args: undefined })]),
			ValidationCode.HOST_TOOL_UNDECLARED_PLACEHOLDER,
			["'id'"],
		],
		[
			'a string argument without pattern',
			modelStep([tool({ args: { id: { type: 'string' } } })]),
			ValidationCode.HOST_TOOL_ARG_NO_PATTERN,
			[
				"Step 's' tool 'queue-task-show': argument 'id' has no pattern",
				'pattern: ^[A-Za-z0-9_-]{1,64}$',
				'type: enum',
			],
		],
		[
			'a string argument with an empty pattern',
			modelStep([tool({ args: { id: { type: 'string', pattern: '' } } })]),
			ValidationCode.HOST_TOOL_ARG_NO_PATTERN,
			['has no pattern'],
		],
		[
			'a pattern that is not anchored at the start',
			modelStep([tool({ args: { id: { type: 'string', pattern: '[a-z]+$' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['anchored', '^'],
		],
		[
			'a pattern that is not anchored at the end',
			modelStep([tool({ args: { id: { type: 'string', pattern: '^[a-z]+' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['anchored', '$'],
		],
		[
			'a pattern whose last dollar is escaped',
			modelStep([tool({ args: { id: { type: 'string', pattern: '^[a-z]+\\$' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['anchored'],
		],
		[
			'a pattern that is not a regular expression',
			modelStep([tool({ args: { id: { type: 'string', pattern: '^(a$' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['regular expression'],
		],
		[
			'a pattern that is too long',
			modelStep([tool({ args: { id: { type: 'string', pattern: `^${'a'.repeat(300)}$` } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['256'],
		],
		[
			'an enum without values',
			modelStep([tool({ args: { id: { type: 'enum', values: [] } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['values'],
		],
		[
			'an enum with a duplicated value',
			modelStep([tool({ args: { id: { type: 'enum', values: ['a', 'a'] } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['duplicate'],
		],
		[
			'an enum value that starts with a dash',
			modelStep([tool({ args: { id: { type: 'enum', values: ['ok', '-rf'] } } })]),
			ValidationCode.HOST_TOOL_ARG_LEADING_DASH,
			["'-rf'", 'allowLeadingDash: true'],
		],
		[
			'an integer that can be negative',
			modelStep([tool({ args: { id: { type: 'integer', min: -5, max: 5 } } })]),
			ValidationCode.HOST_TOOL_ARG_LEADING_DASH,
			['allowLeadingDash: true'],
		],
		[
			'an integer with min above max',
			modelStep([tool({ args: { id: { type: 'integer', min: 9, max: 1 } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['min', 'max'],
		],
		[
			'an integer without bounds',
			modelStep([tool({ args: { id: { type: 'integer' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['min', 'max'],
		],
		[
			'an integer with a fractional bound',
			modelStep([tool({ args: { id: { type: 'integer', min: 0.5, max: 4 } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['integer'],
		],
		[
			'a misspelled argument type',
			modelStep([tool({ args: { id: { type: 'strin', pattern: '^a$' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			["'strin'", "Did you mean 'string'"],
		],
		[
			'a missing argument type',
			modelStep([tool({ args: { id: { pattern: '^a$' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['type', 'enum', 'string', 'integer', 'boolean'],
		],
		[
			'a misspelled argument key',
			modelStep([tool({ args: { id: { type: 'string', patern: '^a$', pattern: '^a$' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			["'patern'", "Did you mean 'pattern'"],
		],
		[
			'a key of another argument type',
			modelStep([tool({ args: { id: { type: 'boolean', pattern: '^a$' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			["'pattern'", 'boolean'],
		],
		[
			'an argument name that is not an identifier',
			modelStep([tool({ args: { 'bad-name': ID_ARG, id: ID_ARG } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			["'bad-name'"],
		],
		[
			'args that is a list',
			modelStep([tool({ args: [ID_ARG] })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['args', 'object'],
		],
		[
			'a non-boolean required',
			modelStep([tool({ args: { id: { ...ID_ARG, required: 'yes' } } })]),
			ValidationCode.HOST_TOOL_INVALID_ARG,
			['required', 'boolean'],
		],
		[
			'a cwd that is a path',
			modelStep([tool({ cwd: '/tmp' })]),
			ValidationCode.HOST_TOOL_INVALID_CWD,
			['workspace', 'none'],
		],
		[
			'a cwd that climbs',
			modelStep([tool({ cwd: '..' })]),
			ValidationCode.HOST_TOOL_INVALID_CWD,
			['workspace', 'none'],
		],
		[
			'env written as NAME=value',
			modelStep([tool({ env: ['TOKEN=abc'] })]),
			ValidationCode.HOST_TOOL_INVALID_ENV,
			['NAMES', 'NAME=value'],
		],
		[
			'an env name that starts with a digit',
			modelStep([tool({ env: ['1X'] })]),
			ValidationCode.HOST_TOOL_INVALID_ENV,
			['1X'],
		],
		[
			'an env that is not a list',
			modelStep([tool({ env: 'PATH' })]),
			ValidationCode.HOST_TOOL_INVALID_ENV,
			['list'],
		],
		[
			'a duplicated env name',
			modelStep([tool({ env: ['A', 'A'] })]),
			ValidationCode.HOST_TOOL_INVALID_ENV,
			['more than once'],
		],
		[
			'FLOW_WORKER_TOKEN in env',
			modelStep([tool({ env: ['FLOW_WORKER_TOKEN'] })]),
			ValidationCode.HOST_TOOL_FORBIDDEN_ENV,
			['FLOW_WORKER_TOKEN', 'never'],
		],
		[
			'FLOW_WORKER_TOKEN in another case',
			modelStep([tool({ env: ['flow_worker_token'] })]),
			ValidationCode.HOST_TOOL_FORBIDDEN_ENV,
			['FLOW_WORKER_'],
		],
		[
			'a FLOW_MCP_ variable',
			modelStep([tool({ env: ['FLOW_MCP_CALLBACK_PORT'] })]),
			ValidationCode.HOST_TOOL_FORBIDDEN_ENV,
			['FLOW_MCP_'],
		],
		[
			'another FLOW_WORKER_ variable',
			modelStep([tool({ env: ['FLOW_WORKER_ANYTHING'] })]),
			ValidationCode.HOST_TOOL_FORBIDDEN_ENV,
			['FLOW_WORKER_'],
		],
		[
			'a timeout above 300',
			modelStep([tool({ timeoutSeconds: 301 })]),
			ValidationCode.HOST_TOOL_LIMIT_EXCEEDED,
			['300'],
		],
		['a timeout of 0', modelStep([tool({ timeoutSeconds: 0 })]), ValidationCode.HOST_TOOL_LIMIT_EXCEEDED, ['300']],
		[
			'a fractional timeout',
			modelStep([tool({ timeoutSeconds: 1.5 })]),
			ValidationCode.HOST_TOOL_LIMIT_EXCEEDED,
			['integer'],
		],
		[
			'a string timeout',
			modelStep([tool({ timeoutSeconds: '30' })]),
			ValidationCode.HOST_TOOL_LIMIT_EXCEEDED,
			['integer'],
		],
		[
			'an output cap above 1 MiB',
			modelStep([tool({ maxOutputBytes: 1_048_577 })]),
			ValidationCode.HOST_TOOL_LIMIT_EXCEEDED,
			['1048576'],
		],
		[
			'more than 16 tools',
			modelStep(Array.from({ length: 17 }, (_, index) => tool({ id: `t-${index}` }))),
			ValidationCode.HOST_TOOL_TOO_MANY,
			["Step 's': 17 host tools declared, the limit is 16. Fix:"],
		],
	];

	it.each(cases)('%s', (_label, step, code, fragments) => {
		const issues = issuesOf(step).filter(issue => issue.code === code);
		expect(issues.length).toBeGreaterThan(0);
		const issue = issues[0]!;
		expect(issue.severity).toBe('error');
		for (const fragment of fragments) {
			expect(issue.message).toContain(fragment);
		}
		expect(issue.location?.stepId).toBe('s');
	});

	it.each(cases)('%s: every message names the step and carries a Fix line', (_label, step) => {
		const errors = errorsOf(step);
		expect(errors.length).toBeGreaterThan(0);
		for (const issue of errors) {
			expect(issue.message).toContain("Step 's'");
			expect(issue.message).toMatch(/ Fix: \S/);
		}
	});

	it('names the tool in the message of a tool-level problem', () => {
		const issue = errorsOf(modelStep([tool({ cwd: '/tmp' })]))[0]!;
		expect(issue.message).toContain("tool 'queue-task-show'");
	});

	it('reports each problem of a tool, not only the first', () => {
		const codes = errorsOf(
			modelStep([tool({ sideEffect: undefined, cwd: '/tmp', env: ['FLOW_WORKER_TOKEN'] })])
		).map(issue => issue.code);
		expect(codes).toEqual(
			expect.arrayContaining([
				ValidationCode.HOST_TOOL_INVALID_SIDE_EFFECT,
				ValidationCode.HOST_TOOL_INVALID_CWD,
				ValidationCode.HOST_TOOL_FORBIDDEN_ENV,
			])
		);
	});

	it('reports a problem in the second tool with that tool id', () => {
		const issue = errorsOf(modelStep([tool(), tool({ id: 'second', cwd: '/tmp' })]))[0]!;
		expect(issue.message).toContain("tool 'second'");
	});
});

describe('HostToolValidator - warnings', () => {
	it('warns about an argument that the command never uses', () => {
		const issues = issuesOf(modelStep([tool({ args: { id: ID_ARG, extra: { type: 'boolean' } } })]));
		expect(issues).toHaveLength(1);
		expect(issues[0]!).toMatchObject({ severity: 'warning', code: ValidationCode.HOST_TOOL_UNUSED_ARG });
		expect(issues[0]!.message).toContain("'extra'");
		expect(issues[0]!.message).toContain('Fix:');
	});

	it.each(['apiToken', 'secretValue', 'password', 'userCredential', 'PASSWD'])(
		'warns when log: true is set on the argument %s',
		name => {
			const args = { id: ID_ARG, [name]: { type: 'string', pattern: '^[a-z]+$', log: true } };
			const issues = issuesOf(modelStep([tool({ args, command: ['task', '{id}', `--v={${name}}`] })]));
			expect(issues).toHaveLength(1);
			expect(issues[0]!).toMatchObject({ severity: 'warning', code: ValidationCode.HOST_TOOL_LOG_SENSITIVE });
			expect(issues[0]!.message).toContain('Fix:');
		}
	);

	it('does not warn about log: true on an ordinary argument', () => {
		const args = { id: { ...ID_ARG, log: true } };
		expect(issuesOf(modelStep([tool({ args })]))).toEqual([]);
	});
});

describe('HostToolValidator - the size of what the model is shown', () => {
	it('refuses a description set above 16384 bytes, naming the size and the limit', () => {
		const huge = tool({ description: 'x'.repeat(20_000) });
		const issue = errorsOf(modelStep([huge]))[0]!;
		expect(issue.code).toBe(ValidationCode.HOST_TOOL_DESCRIPTION_TOO_LARGE);
		expect(issue.message).toMatch(
			/^Step 's': host tools description is \d+ bytes, the limit is 16384\. Fix: shorten descriptions or declare fewer tools\.$/
		);
	});

	it('counts bytes, not characters', () => {
		// 6000 three-byte characters = 18000 bytes, under 16384 characters.
		const issue = errorsOf(modelStep([tool({ description: '€'.repeat(6000) })]))[0]!;
		expect(issue.code).toBe(ValidationCode.HOST_TOOL_DESCRIPTION_TOO_LARGE);
	});

	it('accepts 16 small tools', () => {
		const tools = Array.from({ length: 16 }, (_, index) => tool({ id: `t-${index}`, description: 'small' }));
		expect(issuesOf(modelStep(tools))).toEqual([]);
	});
});

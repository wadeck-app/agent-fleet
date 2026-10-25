/** Queue source name under which flow declares its events. */
export const FLOW_EVENT_SOURCE = 'flow';

/** One event flow publishes, as declared to the queue (structurally the queue SDK's `EventDeclaration`). */
export interface FlowEventDefinition {
	/** Exact event name; consumers match it exactly (`queue wait <name>`). */
	name: string;
	/** When it fires, whether it repeats, what does NOT fire it. At most 500 characters. */
	description: string;
	/** JSON Schema of the payload. Documentation for the queue; the payload is never checked against it. */
	schema: Record<string, unknown>;
	/** A realistic payload. */
	example: Record<string, unknown>;
	/** Payload paths that identify what the event is about: what `queue wait --when` filters on. */
	correlationKey: string[];
	/** The event ends the thing it is about. */
	terminal: boolean;
	outcome: 'success' | 'failure' | 'info';
}

const EXECUTION_KEY = ['payload.executionId'];
const STEP_KEY = ['payload.executionId', 'payload.stepId'];

/** Payload property schemas shared by the events; the descriptions feed the generated flow docs. */
const PROPERTIES = {
	executionId: { type: 'string', description: 'Execution identifier; the `--when` filter of every event' },
	flowId: { type: 'string', description: 'Flow the execution runs' },
	stepId: { type: 'string', description: 'Step the event is about' },
	attempt: {
		type: 'integer',
		minimum: 1,
		description: 'Attempt number of the step: 1 for the first run, +1 per retry or relaunch',
	},
	startedAt: { type: 'string', description: 'ISO timestamp of the start' },
	completedAt: { type: 'string', description: 'ISO timestamp of the end; only once finished' },
	durationMs: { type: 'integer', minimum: 0, description: 'Milliseconds between start and end; only once finished' },
	projectRoot: { type: 'string', description: 'Project the execution belongs to, when it has one' },
	projectId: {
		type: 'string',
		description: 'Registry id of the project the execution belongs to, when it has one',
	},
	error: {
		type: 'string',
		maxLength: 200,
		description: 'Failed events only: first line of the (secret-masked) error, at most 200 characters',
	},
} as const;

type PropertyName = keyof typeof PROPERTIES;

function payloadSchema(
	status: 'running' | 'completed' | 'failed',
	required: PropertyName[],
	optional: PropertyName[]
): Record<string, unknown> {
	const names = [...required, ...optional];
	return {
		type: 'object',
		properties: {
			...Object.fromEntries(names.map(name => [name, PROPERTIES[name]])),
			status: { enum: [status], description: '`running`, `completed` or `failed`' },
		},
		required: [...required, 'status'],
		additionalProperties: false,
	};
}

const EXECUTION_STARTED_AT = '2026-10-24T09:00:00.000Z';
const EXECUTION_ENDED_AT = '2026-10-24T09:04:12.500Z';
const STEP_STARTED_AT = '2026-10-24T09:00:03.000Z';
const STEP_ENDED_AT = '2026-10-24T09:01:30.250Z';
const PROJECT = '/work/my-project';
const PROJECT_ID = 'a1b2c3d4';

const EXECUTION_OPTIONAL: PropertyName[] = ['startedAt', 'projectRoot', 'projectId'];
const EXECUTION_FINISHED_OPTIONAL: PropertyName[] = [
	'startedAt',
	'completedAt',
	'durationMs',
	'projectRoot',
	'projectId',
];
const STEP_OPTIONAL: PropertyName[] = ['startedAt', 'projectRoot', 'projectId'];
const STEP_FINISHED_OPTIONAL: PropertyName[] = ['startedAt', 'completedAt', 'durationMs', 'projectRoot', 'projectId'];

/**
 * The single definition of the events flow publishes. It feeds the queue declaration (flow-cli) and
 * the generated flow documentation (`EventsDocumentation`), so the two cannot drift.
 */
export const FLOW_EVENT_CATALOG: readonly FlowEventDefinition[] = [
	{
		name: 'flow.execution.started',
		description:
			'The first step of an execution is dispatched. Fires once per execution. Does NOT fire again on `flow resume`.',
		schema: payloadSchema('running', ['executionId', 'flowId'], EXECUTION_OPTIONAL),
		example: {
			executionId: 'exec-1a2b3c',
			flowId: 'review-pr',
			status: 'running',
			startedAt: EXECUTION_STARTED_AT,
			projectRoot: PROJECT,
			projectId: PROJECT_ID,
		},
		correlationKey: EXECUTION_KEY,
		terminal: false,
		outcome: 'info',
	},
	{
		name: 'flow.execution.completed',
		description:
			'Every step of the execution completed. Does NOT fire for a re-queued or retried execution, nor for a failed one (see flow.execution.failed). Wait for completed OR failed to know an execution ended.',
		schema: payloadSchema('completed', ['executionId', 'flowId'], EXECUTION_FINISHED_OPTIONAL),
		example: {
			executionId: 'exec-1a2b3c',
			flowId: 'review-pr',
			status: 'completed',
			startedAt: EXECUTION_STARTED_AT,
			completedAt: EXECUTION_ENDED_AT,
			durationMs: 252500,
			projectRoot: PROJECT,
			projectId: PROJECT_ID,
		},
		correlationKey: EXECUTION_KEY,
		terminal: true,
		outcome: 'success',
	},
	{
		name: 'flow.execution.failed',
		description:
			'The execution failed for good, including when it waits on an unanswered user_intervention. `flow resume` can reopen such an execution, which may later fire flow.execution.completed. Does NOT fire for a step failure that is retried (see flow.step.failed).',
		schema: payloadSchema('failed', ['executionId', 'flowId'], [...EXECUTION_FINISHED_OPTIONAL, 'error']),
		example: {
			executionId: 'exec-4d5e6f',
			flowId: 'review-pr',
			status: 'failed',
			startedAt: EXECUTION_STARTED_AT,
			completedAt: EXECUTION_ENDED_AT,
			durationMs: 252500,
			projectRoot: PROJECT,
			projectId: PROJECT_ID,
			error: 'Step "build" failed: exit code 1',
		},
		correlationKey: EXECUTION_KEY,
		terminal: true,
		outcome: 'failure',
	},
	{
		name: 'flow.step.started',
		description:
			'A step attempt starts. Fires again on each retry, with attempt + 1. Does NOT fire for a step that is skipped.',
		schema: payloadSchema('running', ['executionId', 'flowId', 'stepId', 'attempt'], STEP_OPTIONAL),
		example: {
			executionId: 'exec-1a2b3c',
			flowId: 'review-pr',
			stepId: 'build',
			status: 'running',
			attempt: 1,
			startedAt: STEP_STARTED_AT,
			projectRoot: PROJECT,
			projectId: PROJECT_ID,
		},
		correlationKey: STEP_KEY,
		terminal: false,
		outcome: 'info',
	},
	{
		name: 'flow.step.completed',
		description: 'A step attempt ran and completed. Does NOT fire for a skipped step, which publishes nothing.',
		schema: payloadSchema('completed', ['executionId', 'flowId', 'stepId', 'attempt'], STEP_FINISHED_OPTIONAL),
		example: {
			executionId: 'exec-1a2b3c',
			flowId: 'review-pr',
			stepId: 'build',
			status: 'completed',
			attempt: 1,
			startedAt: STEP_STARTED_AT,
			completedAt: STEP_ENDED_AT,
			durationMs: 87250,
			projectRoot: PROJECT,
			projectId: PROJECT_ID,
		},
		correlationKey: STEP_KEY,
		terminal: true,
		outcome: 'success',
	},
	{
		name: 'flow.step.failed',
		description:
			'A step attempt failed. Not final: when the step is retried, flow.step.started follows with attempt + 1. To know the step is over for good, also wait for flow.execution.failed.',
		schema: payloadSchema(
			'failed',
			['executionId', 'flowId', 'stepId', 'attempt'],
			[...STEP_FINISHED_OPTIONAL, 'error']
		),
		example: {
			executionId: 'exec-4d5e6f',
			flowId: 'review-pr',
			stepId: 'build',
			status: 'failed',
			attempt: 2,
			startedAt: STEP_STARTED_AT,
			completedAt: STEP_ENDED_AT,
			durationMs: 87250,
			projectRoot: PROJECT,
			projectId: PROJECT_ID,
			error: 'exit code 1',
		},
		correlationKey: STEP_KEY,
		terminal: false,
		outcome: 'failure',
	},
];

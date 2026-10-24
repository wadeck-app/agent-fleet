import { z } from 'zod';

import { defineRoutes } from '../route-builder';

/**
 * ===========================================================================================
 * FLOW DAEMON API CONTRACT (read-only)
 * ===========================================================================================
 *
 * What the `flow` CLI shows about the local flow daemon, served to the web UIs:
 * executions history/detail, flows that ran, live workers + declared worker sources,
 * daemon logs, plugin catalog. Logic lives in flow-core (FlowQueryService); these schemas
 * only describe the wire format. Response parsing strips unknown keys, so nothing beyond
 * what is declared here (e.g. step `meta`) can leave the machine.
 *
 * Routes are ordered from shortest to longest path (route-builder requirement).
 * ===========================================================================================
 */

export const FLOW_EXECUTION_STATUSES = ['queued', 'running', 'completed', 'failed', 're-queued'] as const;
export const FlowExecutionStatusSchema = z.enum(FLOW_EXECUTION_STATUSES);

/** Hard caps: a request above them is a 400, not silently clamped. */
export const MAX_EXECUTIONS_LIMIT = 500;
export const MAX_TAIL_CHARS = 1_000_000;
export const MAX_LOG_LINES = 10_000;
export const DEFAULT_LOG_LINES = 200;
export const MAX_EXECUTION_LOG_LIMIT = 1000;
export const DEFAULT_EXECUTION_LOG_LIMIT = 100;

/** Query strings from a form or the DSL carry `?flow=` for a filter nobody picked: empty means unset. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const optionalText = z.preprocess(emptyAsUndefined, z.string().optional());
// Digits only: z.coerce.number() would also accept '1e3', '0x10' and ' 3'.
const wholeNumber = (min: number, max?: number) => {
	const base = z.string().regex(/^\d+$/, 'must be a whole number').transform(Number).pipe(z.number().int().min(min));
	return z.preprocess(emptyAsUndefined, (max === undefined ? base : base.pipe(z.number().max(max))).optional());
};
const spelledBoolean = z.preprocess(
	emptyAsUndefined,
	z
		.enum(['true', 'false'])
		.transform(value => value === 'true')
		.optional()
);

export const FlowExecutionsQuerySchema = z
	.object({
		limit: wholeNumber(1, MAX_EXECUTIONS_LIMIT),
		offset: wholeNumber(0),
		/** Zero-based page (what the DSL Pagination component sends); mutually exclusive with `offset`. */
		page: wholeNumber(0),
		status: z.preprocess(emptyAsUndefined, FlowExecutionStatusSchema.optional()),
		flow: optionalText,
		/** Execution id prefix: a lookup, pagination is not applied. */
		id: optionalText,
	})
	.refine(query => query.page === undefined || query.offset === undefined, {
		message: "'page' and 'offset' cannot be combined: use page (with limit) or offset, not both.",
		path: ['page'],
	});

export const FlowExecutionSummarySchema = z.object({
	executionId: z.string(),
	flowId: z.string(),
	flowFile: z.string(),
	status: z.string(),
	startedAt: z.string(),
	completedAt: z.string().nullable(),
	duration: z.string(),
	lastError: z.string().optional(),
	lastErrorRecovered: z.boolean(),
	projectRoot: z.string().optional(),
	stepCount: z.number(),
	failedStepCount: z.number(),
});

export const FlowExecutionsResponseSchema = z.object({
	items: z.array(FlowExecutionSummarySchema),
	total: z.number(),
	limit: z.number(),
	offset: z.number(),
});

export const FlowStepSchema = z.object({
	stepId: z.string(),
	status: z.string(),
	injected: z.boolean(),
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
	duration: z.string(),
	attempts: z.number().optional(),
	error: z.string().optional(),
	model: z.string().optional(),
	costUsd: z.number().optional(),
	sourceId: z.string().optional(),
	workerId: z.string().optional(),
	relaunches: z.array(z.object({ at: z.string(), feedback: z.string() })),
});

export const FlowExecutionDetailSchema = FlowExecutionSummarySchema.extend({
	filePath: z.string(),
	currentSteps: z.array(z.string()),
	steps: z.array(FlowStepSchema),
	totalCostUsd: z.number().optional(),
	/** The text `flow show` prints (failed steps carry the tail of their output). */
	text: z.string(),
});

export const FlowExecutionDetailQuerySchema = z.object({
	/** Trailing characters kept of a failed step's output. */
	tail: wholeNumber(1, MAX_TAIL_CHARS),
	full: spelledBoolean,
});

export const FlowSummarySchema = z.object({
	flowId: z.string(),
	executionCount: z.number(),
	failedCount: z.number(),
	lastStartedAt: z.string(),
});

export const FlowSummariesResponseSchema = z.object({ flows: z.array(FlowSummarySchema) });

export const FlowLogsQuerySchema = z.object({
	/** UTC day `YYYY-MM-DD` (default today). */
	date: z.preprocess(
		emptyAsUndefined,
		z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
			.optional()
	),
	/** Last N lines (default 200). */
	lines: wholeNumber(1, MAX_LOG_LINES),
	/** `true` formats entries as `HH:mm:ss.SSS [LEVEL] message`. */
	human: spelledBoolean,
});

export const FlowExecutionLogsQuerySchema = z.object({
	/** Only this step's lines (`__execution` holds the lines about the run itself). */
	step: optionalText,
	/** Only this level: debug, info, warning or error. */
	level: optionalText,
	/** Case-insensitive substring of the message. */
	q: optionalText,
	/** Zero-based page counted from the END of the matching lines: 0 (default) is the tail. */
	page: wholeNumber(0),
	limit: wholeNumber(1, MAX_EXECUTION_LOG_LIMIT),
});

export const FlowExecutionLogEntrySchema = z.object({
	timestamp: z.string(),
	level: z.string(),
	stepId: z.string(),
	message: z.string(),
});

export const FlowExecutionLogsResponseSchema = z.object({
	executionId: z.string(),
	flowId: z.string(),
	/** The requested page, oldest first. */
	entries: z.array(FlowExecutionLogEntrySchema),
	/** Lines matching the filters, before paging. */
	total: z.number(),
	/** Every step that logged (not narrowed by the filters), to offer them all in a filter. */
	stepIds: z.array(z.string()),
	/** Days whose log file was read; empty when the daemon wrote no log for the run (never ran, or rotated away). */
	daysRead: z.array(z.string()),
	/** Lines mentioning the execution that could not be parsed: the list may be incomplete by this many. */
	unreadableLines: z.number(),
	logsDir: z.string(),
	/** Error and output the execution record kept for failed steps (what is left once the daily logs rotated away). */
	recordedOutput: z.string(),
	limit: z.number(),
	offset: z.number(),
});

export const FlowLogsResponseSchema = z.object({
	filePath: z.string(),
	exists: z.boolean(),
	text: z.string(),
	size: z.number(),
});

export const FlowWorkerSchema = z.object({
	workerId: z.string(),
	pid: z.number(),
	version: z.string().optional(),
	state: z.enum(['idle', 'busy']),
	sourceId: z.string().optional(),
	labels: z.array(z.string()),
	attachedProjects: z.array(z.string()),
	hasUserInterface: z.boolean(),
	ephemeral: z.boolean(),
	shellCapabilities: z.array(z.enum(['bash', 'cmd', 'pwsh'])).optional(),
});

export const FlowDaemonStatusSchema = z.discriminatedUnion('running', [
	z.object({ running: z.literal(false), reason: z.string() }),
	z.object({
		running: z.literal(true),
		pid: z.number().optional(),
		port: z.number().optional(),
		startedAt: z.string().optional(),
	}),
]);

/** Declared sources never include credential hashes (flow-core projects them out). */
export const FlowDeclaredSourceSchema = z.object({
	sourceId: z.string(),
	provider: z.string(),
	labels: z.array(z.string()),
	maxWorkers: z.number(),
});

export const FlowWorkersResponseSchema = z.object({
	workers: z.array(FlowWorkerSchema),
	daemon: FlowDaemonStatusSchema,
	declaredSources: z.array(FlowDeclaredSourceSchema),
	declaredSourcesError: z.string().optional(),
	emptyExplanation: z.string().optional(),
});

export const FlowPluginSchema = z.object({
	id: z.string(),
	extensionPoint: z.string(),
	typeString: z.string(),
});

export const FlowPluginsResponseSchema = z.object({ plugins: z.array(FlowPluginSchema) });

export const FlowPluginDetailSchema = FlowPluginSchema.extend({
	snippet: z.string(),
	options: z.record(z.string(), z.string()),
});

export const FLOW_DAEMON_API_ROUTES = defineRoutes({
	'/api/flow-daemon/flows': {
		GET: { response: FlowSummariesResponseSchema },
	},
	'/api/flow-daemon/logs': {
		GET: { query: FlowLogsQuerySchema, response: FlowLogsResponseSchema },
	},
	'/api/flow-daemon/workers': {
		GET: { response: FlowWorkersResponseSchema },
	},
	'/api/flow-daemon/plugins': {
		GET: { response: FlowPluginsResponseSchema },
	},
	'/api/flow-daemon/executions': {
		GET: { query: FlowExecutionsQuerySchema, response: FlowExecutionsResponseSchema },
	},
	'/api/flow-daemon/plugins/:id': {
		GET: { params: z.object({ id: z.string() }), response: FlowPluginDetailSchema },
	},
	'/api/flow-daemon/executions/:id': {
		GET: {
			params: z.object({ id: z.string() }),
			query: FlowExecutionDetailQuerySchema,
			response: FlowExecutionDetailSchema,
		},
	},
	'/api/flow-daemon/executions/:id/logs': {
		GET: {
			params: z.object({ id: z.string() }),
			query: FlowExecutionLogsQuerySchema,
			response: FlowExecutionLogsResponseSchema,
		},
	},
});

export type FlowExecutionsQuery = z.infer<typeof FlowExecutionsQuerySchema>;
export type FlowExecutionSummary = z.infer<typeof FlowExecutionSummarySchema>;
export type FlowExecutionsResponse = z.infer<typeof FlowExecutionsResponseSchema>;
export type FlowExecutionDetail = z.infer<typeof FlowExecutionDetailSchema>;
export type FlowExecutionDetailQuery = z.infer<typeof FlowExecutionDetailQuerySchema>;
export type FlowSummariesResponse = z.infer<typeof FlowSummariesResponseSchema>;
export type FlowExecutionLogsQuery = z.infer<typeof FlowExecutionLogsQuerySchema>;
export type FlowExecutionLogsResponse = z.infer<typeof FlowExecutionLogsResponseSchema>;
export type FlowLogsQuery = z.infer<typeof FlowLogsQuerySchema>;
export type FlowLogsResponse = z.infer<typeof FlowLogsResponseSchema>;
export type FlowWorkersResponse = z.infer<typeof FlowWorkersResponseSchema>;
export type FlowPluginsResponse = z.infer<typeof FlowPluginsResponseSchema>;
export type FlowPluginDetail = z.infer<typeof FlowPluginDetailSchema>;
export type FlowDaemonApiRoutes = typeof FLOW_DAEMON_API_ROUTES;

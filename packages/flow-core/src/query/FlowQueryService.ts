import { definitionsDirOf, executionsDirOf } from '../config/FlowConfigLayout.js';
import { FlowCoreError, errorMessage } from '../errors.js';
import type { FlowGraphResult, FlowGraphTarget } from '../graph/FlowGraph.js';
import { queryFlowGraph } from '../graph/FlowGraphQuery.js';
import { type ExecutionFilterOptions, type FilteredExecutions, filterExecutions } from '../history/ExecutionFilter.js';
import {
	type SkippedExecutionFile,
	describeSkippedExecutions,
	loadExecutionReport,
} from '../history/ExecutionLoader.js';
import { type FlowSummary, summarizeFlows } from '../history/FlowSummaries.js';
import { buildHistoryTable } from '../history/HistoryTable.js';
import { type RunDigest, buildRunDigest } from '../history/RunDigest.js';
import { type StatusCounts, countByStatus } from '../history/StatusCounts.js';
import {
	type ExecutionLogQuery,
	type ExecutionLogs,
	formatRecordedStepOutput,
	readExecutionLogs,
} from '../logs/ExecutionLogs.js';
import { type LogReadResult, type ReadLogsOptions, readLogs } from '../logs/LogReader.js';
import type { LogRecordStep } from '../logs/LogRecordStep.js';
import {
	type PluginCatalogSource,
	type PluginDescription,
	type PluginEntry,
	describePlugin,
	formatPluginTable,
	listPlugins,
} from '../plugins/PluginCatalog.js';
import type { ProjectLookup } from '../project/ProjectLabel.js';
import {
	type RenderOptions,
	type ResolvedExecution,
	renderExecutionDetail,
	resolveExecution,
} from '../show/ExecutionDetail.js';
import { readWorkerList } from '../worker/WorkerList.js';
import { type DaemonStatus, describeNoLiveWorkers } from '../worker/WorkerListing.js';
import { type DeclaredWorkerSource, readDeclaredWorkerSources } from '../worker/WorkerSources.js';
import type { WorkerSummary } from '../worker/WorkerSummary.js';

export interface FlowQueryDirectories {
	/** Where the daemon persists one `<id>.json` per execution. */
	executionsDir: string;
	/** Flow config directory: holds `logs/`. */
	configDir: string;
	/** Directory of the daemon's port file and worker source registry (the same one in practice). */
	daemonDir: string;
}

export interface FlowQueryServiceOptions extends FlowQueryDirectories {
	/**
	 * Manifests of the plugins the host ships (the CLI bundles its own). Required only by
	 * listPlugins/describePlugin, which refuse to answer without them rather than list nothing.
	 */
	pluginManifests?: Record<string, PluginCatalogSource>;
	/** Clock used to date daemon-derived explanations (default: the system clock); injected by tests. */
	now?: () => number;
	/**
	 * Names the project of an execution (see createRegistryProjectLookup). Without it only the recorded id is shown.
	 * Hosts that build views themselves pass `service.projectLookup` to toExecutionSummary/toExecutionDetail.
	 */
	projectLookup?: ProjectLookup;
}

/** A page of executions plus the execution files that could not be read, so no host has to hide them. */
export interface QueriedExecutions extends FilteredExecutions {
	skipped: SkippedExecutionFile[];
}

/** The log lines of one execution, with the failure text its record kept. */
export interface ExecutionLogsView extends ExecutionLogs {
	/** Full id: the query may have been a prefix. */
	executionId: string;
	flowId: string;
	/** Error, stdout and stderr the execution record kept for failed steps (the selected step only): what is left once the daily logs rotated away. */
	recordedOutput: string;
	/** The steps of the record (record order) with their status, times, attempts and parent. */
	steps: LogRecordStep[];
	/**
	 * Why the declared sub-step nesting is unknown (the flow definition of the run cannot be read), undefined when it was
	 * read. The record keeps `parent` only for injected steps; the nesting of declared sub-steps lives in the definition.
	 */
	nestingError?: string;
	/** ISO 8601 start of the run. */
	startedAt: string;
	/** ISO 8601 end of the run; null while it goes on. */
	completedAt: string | null;
}

/** The text `flow history` prints and the execution files it had to skip. */
export interface RenderedHistory {
	text: string;
	skipped: SkippedExecutionFile[];
	/** One-line warning about the skipped files; undefined when none. */
	skippedWarning: string | undefined;
}

export interface WorkerListResult {
	workers: WorkerSummary[];
	daemon: DaemonStatus;
	/** Declared sources, read only when no worker is connected (the case they explain). */
	declaredSources: DeclaredWorkerSource[];
	/** Why the declared sources could not be read; the listing itself still succeeded. */
	declaredSourcesError?: string;
	/** Human explanation of an empty list: daemon state and declared sources. Absent when workers are connected. */
	emptyExplanation?: string;
}

function assertDirectory(name: keyof FlowQueryDirectories, value: string): void {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new FlowCoreError(
			`FlowQueryService needs a non-empty '${name}' (got ${JSON.stringify(value)}). Pass the flow config directory, e.g. ConfigDir.get('flow').`,
			'invalid-configuration'
		);
	}
}

/**
 * Read-only queries over what flow persists and what the daemon reports: the one entry point shared by
 * the `flow` CLI and any other host. All locations are injected; nothing here reads the process
 * environment, prints, or exits.
 */
function parentField(parent: string | undefined): { parent?: string } {
	return parent === undefined ? {} : { parent };
}

export class FlowQueryService {
	/** All flow locations hang off the config dir (`executions/`, `logs/`, daemon files at its root). */
	static forConfigDir(
		configDir: string,
		pluginManifests?: Record<string, PluginCatalogSource>,
		projectLookup?: ProjectLookup
	): FlowQueryService {
		assertDirectory('configDir', configDir);
		return new FlowQueryService({
			executionsDir: executionsDirOf(configDir),
			configDir,
			daemonDir: configDir,
			pluginManifests,
			...(projectLookup === undefined ? {} : { projectLookup }),
		});
	}

	/** The lookup that names projects, when the host gave one. */
	readonly projectLookup: ProjectLookup | undefined;

	/** Frozen: the locations are fixed for the life of the service. */
	readonly directories: Readonly<FlowQueryDirectories>;
	private readonly pluginManifests: Record<string, PluginCatalogSource> | undefined;
	private readonly now: () => number;

	constructor(options: FlowQueryServiceOptions) {
		assertDirectory('executionsDir', options.executionsDir);
		assertDirectory('configDir', options.configDir);
		assertDirectory('daemonDir', options.daemonDir);
		this.directories = Object.freeze({
			executionsDir: options.executionsDir,
			configDir: options.configDir,
			daemonDir: options.daemonDir,
		});
		this.pluginManifests = options.pluginManifests;
		this.now = options.now ?? Date.now;
		this.projectLookup = options.projectLookup;
	}

	/** Executions, newest first, filtered and paginated by {@link filterExecutions}. */
	listExecutions(filter: ExecutionFilterOptions): QueriedExecutions {
		const { executions, skipped } = loadExecutionReport(this.directories.executionsDir);
		return { ...filterExecutions(executions, filter), skipped };
	}

	/** Distinct flows that have run, with their counts: the values `listExecutions({ flow })` accepts. */
	listFlows(): FlowSummary[] {
		return summarizeFlows(loadExecutionReport(this.directories.executionsDir).executions);
	}

	/** Executions per status and in total (one read of the executions), for one flow when `flow` is given. */
	countByStatus(flow?: string): StatusCounts {
		return countByStatus(loadExecutionReport(this.directories.executionsDir).executions, flow);
	}

	/** Counters, per-day counts and latest runs for the dashboard card (one read of the executions, at the service clock). */
	digestRuns(): RunDigest {
		return buildRunDigest(loadExecutionReport(this.directories.executionsDir).executions, this.now());
	}

	/** The text `flow history` prints (table, or detail view when `filter.id` is set). */
	renderHistory(filter: ExecutionFilterOptions): string {
		return this.renderHistoryReport(filter).text;
	}

	/** Like {@link renderHistory}, with the execution files that were skipped and a ready-made warning for them. */
	renderHistoryReport(filter: ExecutionFilterOptions): RenderedHistory {
		const { executions, skipped } = loadExecutionReport(this.directories.executionsDir);
		return {
			text: buildHistoryTable(executions, filter, this.projectLookup),
			skipped,
			skippedWarning: describeSkippedExecutions(skipped),
		};
	}

	/** One execution by id or unique prefix. Throws ExecutionLookupError. */
	getExecution(idOrPrefix: string): ResolvedExecution {
		return resolveExecution(this.directories.executionsDir, idOrPrefix);
	}

	/**
	 * Graph of a flow: nodes = steps, edges = depends / when / onFailure.goto / parent. With `executionId` the
	 * nodes carry that run's step states. Throws ExecutionLookupError, FlowDefinitionError or FlowCoreError.
	 */
	getFlowGraph(target: FlowGraphTarget): FlowGraphResult {
		return queryFlowGraph(this.directories.executionsDir, target, definitionsDirOf(this.directories.configDir));
	}

	/** The text `flow show <executionId>` prints. Throws ExecutionLookupError. */
	renderExecution(idOrPrefix: string, options: RenderOptions): string {
		return renderExecutionDetail(this.getExecution(idOrPrefix), {
			...options,
			...(this.projectLookup === undefined || options.projectLookup !== undefined
				? {}
				: { projectLookup: this.projectLookup }),
		});
	}

	/** Live workers as the daemon reports them. A missing daemon is an empty list; other daemon failures throw WorkerListError. */
	async listWorkers(): Promise<WorkerListResult> {
		const { workers, daemon } = await readWorkerList(this.directories.daemonDir);
		if (workers.length > 0) {
			return { workers, daemon, declaredSources: [] };
		}

		let declaredSources: DeclaredWorkerSource[] = [];
		let declaredSourcesError: string | undefined;
		try {
			declaredSources = readDeclaredWorkerSources(this.directories.daemonDir);
		} catch (err) {
			// A damaged registry must not turn the listing into a failure: the question was about
			// live workers and that answer is known. The reason is reported, not hidden.
			declaredSourcesError = errorMessage(err);
		}
		return {
			workers,
			daemon,
			declaredSources,
			...(declaredSourcesError !== undefined ? { declaredSourcesError } : {}),
			emptyExplanation: describeNoLiveWorkers(declaredSources, daemon, this.now()),
		};
	}

	/** Tail of one day's daemon log (default: today). */
	readLogs(options: ReadLogsOptions): LogReadResult {
		return readLogs(this.directories.configDir, options);
	}

	/**
	 * The daemon log lines of one execution (id or unique prefix), filtered by step, level and text, paged from the end.
	 * `stepIds` lists the steps of the record followed by the other ids that logged (such as `__execution`).
	 * Throws ExecutionLookupError and InvalidQueryError.
	 */
	readExecutionLogs(idOrPrefix: string, query: ExecutionLogQuery): ExecutionLogsView {
		const { record } = this.getExecution(idOrPrefix);
		const logs = readExecutionLogs(
			this.directories.configDir,
			{ executionId: record.executionId, startedAt: record.startedAt, completedAt: record.completedAt },
			query,
			new Date(this.now())
		);
		const nesting = this.declaredParents(record.executionId);
		const recordedIds = Object.keys(record.steps);
		return {
			...logs,
			stepIds: [...recordedIds, ...logs.stepIds.filter(id => !recordedIds.includes(id))],
			executionId: record.executionId,
			flowId: record.flowId,
			recordedOutput: formatRecordedStepOutput(record.steps, query.stepId),
			steps: Object.entries(record.steps).map(([stepId, step]) => ({
				stepId,
				status: step.status,
				...(step.startedAt !== undefined ? { startedAt: step.startedAt } : {}),
				...(step.completedAt !== undefined ? { completedAt: step.completedAt } : {}),
				...(step.attempts !== undefined ? { attempts: step.attempts } : {}),
				...parentField(step.parent ?? nesting.parents[stepId]),
			})),
			...(nesting.error === undefined ? {} : { nestingError: nesting.error }),
			startedAt: record.startedAt,
			completedAt: record.completedAt ?? null,
		};
	}

	// Child -> parent of the `parent:` steps of the definition the run used; the reason when it cannot be read.
	private declaredParents(executionId: string): { parents: Record<string, string>; error?: string } {
		try {
			const { graph } = this.getFlowGraph({ executionId });
			const parents: Record<string, string> = {};
			for (const edge of graph.edges) {
				if (edge.kind === 'substep') {
					parents[edge.from] = edge.to;
				}
			}
			return { parents };
		} catch (err) {
			return { parents: {}, error: errorMessage(err) };
		}
	}

	listPlugins(): PluginEntry[] {
		return listPlugins(this.requirePluginManifests());
	}

	/** The table `flow plugins list` prints. */
	renderPluginTable(): string {
		return formatPluginTable(this.listPlugins());
	}

	describePlugin(pluginId: string): PluginDescription {
		return describePlugin(pluginId, this.requirePluginManifests());
	}

	private requirePluginManifests(): Record<string, PluginCatalogSource> {
		if (!this.pluginManifests) {
			throw new FlowCoreError(
				'No plugin manifests configured: pass `pluginManifests` to FlowQueryService (the CLI passes BUILTIN_PLUGIN_MANIFESTS).',
				'not-configured'
			);
		}
		return this.pluginManifests;
	}
}

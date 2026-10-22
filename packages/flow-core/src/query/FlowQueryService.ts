import { executionsDirOf } from '../config/FlowConfigLayout.js';
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
import { type StatusCounts, countByStatus } from '../history/StatusCounts.js';
import { type LogReadResult, type ReadLogsOptions, readLogs } from '../logs/LogReader.js';
import {
	type PluginCatalogSource,
	type PluginDescription,
	type PluginEntry,
	describePlugin,
	formatPluginTable,
	listPlugins,
} from '../plugins/PluginCatalog.js';
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
}

/** A page of executions plus the execution files that could not be read, so no host has to hide them. */
export interface QueriedExecutions extends FilteredExecutions {
	skipped: SkippedExecutionFile[];
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
export class FlowQueryService {
	/** All flow locations hang off the config dir (`executions/`, `logs/`, daemon files at its root). */
	static forConfigDir(configDir: string, pluginManifests?: Record<string, PluginCatalogSource>): FlowQueryService {
		assertDirectory('configDir', configDir);
		return new FlowQueryService({
			executionsDir: executionsDirOf(configDir),
			configDir,
			daemonDir: configDir,
			pluginManifests,
		});
	}

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

	/** The text `flow history` prints (table, or detail view when `filter.id` is set). */
	renderHistory(filter: ExecutionFilterOptions): string {
		return this.renderHistoryReport(filter).text;
	}

	/** Like {@link renderHistory}, with the execution files that were skipped and a ready-made warning for them. */
	renderHistoryReport(filter: ExecutionFilterOptions): RenderedHistory {
		const { executions, skipped } = loadExecutionReport(this.directories.executionsDir);
		return {
			text: buildHistoryTable(executions, filter),
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
		return queryFlowGraph(this.directories.executionsDir, target);
	}

	/** The text `flow show <executionId>` prints. Throws ExecutionLookupError. */
	renderExecution(idOrPrefix: string, options: RenderOptions): string {
		return renderExecutionDetail(this.getExecution(idOrPrefix), options);
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

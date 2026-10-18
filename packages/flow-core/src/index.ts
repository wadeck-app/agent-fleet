// violations-suppress: ts/no-barrel-index package entry point (package.json main/types) consumed across the package boundary, not an internal re-export hub
// Public API of flow-core: flow-feature logic shared by the `flow` CLI and other hosts.
// Everything here is free of process concerns (no console, no exit, no ConfigDir lookup).

export { FlowCoreError, InvalidQueryError, errorMessage } from './errors.js';

export type {
	ExecutionRecord,
	ExecutionState,
	ExecutionStatus,
	StepState,
	StepStateRecord,
	StepStatus,
} from './execution/ExecutionRecord.js';

export { DEFAULT_HISTORY_LIMIT, filterExecutions } from './history/ExecutionFilter.js';
export type { ExecutionFilterOptions, FilteredExecutions } from './history/ExecutionFilter.js';
export { formatDuration, formatModelCost, formatStarted } from './history/ExecutionFormat.js';
export { loadExecutions } from './history/ExecutionLoader.js';
export { buildHistoryTable, renderDetailView } from './history/HistoryTable.js';

export {
	DEFAULT_TAIL_CHARS,
	ExecutionLookupError,
	looksLikeExecutionId,
	renderExecutionDetail,
	resolveExecution,
	tailText,
} from './show/ExecutionDetail.js';
export type { ExecutionLookupErrorKind, RenderOptions, ResolvedExecution } from './show/ExecutionDetail.js';
export {
	formatInputs,
	formatStatus,
	formatTrigger,
	renderFlowSummary,
	stepDepends,
	stepType,
} from './show/FlowSummary.js';

export { WorkerListError, describeRunningDaemon, formatWorkerLine, readWorkerList } from './worker/WorkerList.js';
export type { WorkerListErrorKind, WorkerListSnapshot } from './worker/WorkerList.js';
export { describeNoLiveWorkers } from './worker/WorkerListing.js';
export type { DaemonStatus } from './worker/WorkerListing.js';
export {
	RELAY_PROVIDER,
	RETIRED_RELAY_PROVIDER,
	WORKER_SOURCE_REGISTRY_FILE,
	WorkerSourceRegistryError,
	assertProviderNotRetired,
	parseWorkerSourceFile,
	readDeclaredWorkerSources,
} from './worker/WorkerSources.js';
export type { DeclaredWorkerSource, WorkerSourceEntry, WorkerSourceRegistryFile } from './worker/WorkerSources.js';
export type { WorkerSummary } from './worker/WorkerSummary.js';

export { formatLogContent, formatLogLine, tailLines } from './logs/LogFormat.js';
export { logFilePath, readAppendedLog, readLogs, todayLogDate } from './logs/LogReader.js';
export type { LogReadResult, ReadLogsOptions } from './logs/LogReader.js';

export {
	PLUGIN_CONFIGS,
	UnknownPluginError,
	describePlugin,
	formatPluginTable,
	listPlugins,
} from './plugins/PluginCatalog.js';
export type { PluginCatalogSource, PluginConfig, PluginDescription, PluginEntry } from './plugins/PluginCatalog.js';
export { BUILTIN_PLUGIN_CATALOG } from './plugins/BuiltinPluginCatalog.js';

export { FlowQueryService } from './query/FlowQueryService.js';
export type { FlowQueryDirectories, FlowQueryServiceOptions, WorkerListResult } from './query/FlowQueryService.js';

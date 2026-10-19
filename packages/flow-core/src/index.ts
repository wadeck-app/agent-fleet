// violations-suppress: ts/no-barrel-index package entry point (package.json main/types) consumed across the package boundary, not an internal re-export hub
// Public API of flow-core: flow-feature logic shared by the `flow` CLI and other hosts.
// Everything here is free of process concerns (no console, no exit, no ConfigDir lookup).

export { FlowCoreError, InvalidQueryError, errorMessage } from './errors.js';

export { FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID } from './appModule/AppModuleIds.js';
export { FLOW_EXPOSED_SLOTS, FLOW_PAGE_PATHS } from './appModule/FlowModuleContract.js';
export { FLOW_CONFIG_DIR_NAME, executionsDirOf, logsDirOf } from './config/FlowConfigLayout.js';
export {
	EXECUTION_ID_LENGTH,
	generateExecutionId,
	isExecutionId,
	looksLikeExecutionId,
} from './execution/ExecutionId.js';

export type { ExecutionState, ExecutionStatus, StepState, StepStatus } from './execution/ExecutionState.js';

export { createRemoteDaemonClient, isUnknownCommandError, outdatedDaemonMessage } from './daemon/RemoteDaemonClient.js';
export { DEFAULT_HISTORY_LIMIT, filterExecutions } from './history/ExecutionFilter.js';
export type { ExecutionFilterOptions, FilteredExecutions } from './history/ExecutionFilter.js';
export { summarizeFlows } from './history/FlowSummaries.js';
export type { FlowSummary } from './history/FlowSummaries.js';
export { formatDuration, formatModelCost, formatStarted } from './history/ExecutionFormat.js';
export { describeSkippedExecutions, loadExecutionReport, loadExecutions } from './history/ExecutionLoader.js';
export type { ExecutionReport, SkippedExecutionFile } from './history/ExecutionLoader.js';
export { buildHistoryTable, renderDetailView } from './history/HistoryTable.js';

export {
	DEFAULT_TAIL_CHARS,
	ExecutionLookupError,
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
export { isLogFileName, logFileName, logFilePath, readAppendedLog, readLogs, todayLogDate } from './logs/LogReader.js';
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
export type {
	FlowQueryDirectories,
	FlowQueryServiceOptions,
	QueriedExecutions,
	RenderedHistory,
	WorkerListResult,
} from './query/FlowQueryService.js';

export { classifyFlowError, httpAnswerOfFlowError, httpStatusOfFlowError } from './ErrorClassification.js';
export type { FlowErrorCategory, HttpErrorAnswer } from './ErrorClassification.js';
export { toExecutionDetail, toExecutionSummary } from './view/ExecutionView.js';
export type { ExecutionDetailView, ExecutionSummary, StepView } from './view/ExecutionView.js';

export { buildFlowGraph } from './graph/FlowGraphBuilder.js';
export { FlowDefinitionError, loadFlowDefinition } from './graph/FlowDefinitionLoader.js';
export type { FlowDefinitionErrorKind } from './graph/FlowDefinitionLoader.js';
export type {
	FlowGraph,
	FlowGraphEdge,
	FlowGraphEdgeKind,
	FlowGraphNode,
	FlowGraphNodeKind,
	FlowGraphResult,
	FlowGraphTarget,
} from './graph/FlowGraph.js';

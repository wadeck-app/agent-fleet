// violations-suppress: ts/no-barrel-index package entry point (package.json main/types) consumed across the package boundary, not an internal re-export hub
// Public API of flow-core: flow-feature logic shared by the `flow` CLI and other hosts.
// Everything here is free of process concerns (no console, no exit, no ConfigDir lookup).

export { FlowCoreError, InvalidQueryError, errorMessage } from './errors.js';

export { FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID } from './appModule/AppModuleIds.js';
export {
	FLOW_ACTION_BUTTON_STYLE,
	FLOW_ACTION_SLOT_ACCEPTS,
	FLOW_EXECUTION_ROW_CONTEXT_FIELDS,
	FLOW_EXPOSED_SLOTS,
	FLOW_PAGE_PATHS,
	FLOW_REQUIRED_RANGE,
	executionLogsPath,
	executionPagePath,
} from './appModule/FlowModuleContract.js';
export { FLOW_LOGS_STEP_PARAM, executionStepLogsPath } from './appModule/FlowExecutionLogsLink.js';
export { FLOW_CHART_INDEX_PATH, chartPathOfExecution, chartPathOfFlow } from './appModule/FlowChartPaths.js';
export {
	FLOW_CONFIG_DIR_NAME,
	definitionSnapshotPathOf,
	definitionSnapshotRefOf,
	definitionsDirOf,
	executionsDirOf,
	logsDirOf,
} from './config/FlowConfigLayout.js';
export { hashDefinition, shortHashOf } from './definitions/DefinitionHash.js';
export {
	DefinitionSnapshotStore,
	type KnownVersion,
	type SavedSnapshot,
} from './definitions/DefinitionSnapshotStore.js';
export {
	type FileVersionAssessment,
	type FileVersionStatus,
	assessFileVersion,
	renderVersionLines,
} from './definitions/FileVersionAssessment.js';
export {
	FlowDefinitionResolver,
	type FileRequest,
	type RegisteredRequest,
	type ResolvedDefinition,
} from './definitions/FlowDefinitionResolver.js';
export { UNVERSIONED, missingVersionWarning, readFlowVersion } from './definitions/FlowVersion.js';
export { FlowVersionError, type FlowVersionErrorKind } from './definitions/FlowVersionError.js';
export { type VersionRow, listFlowVersions, renderVersionTable } from './definitions/FlowVersionListing.js';
export { versionColumnOf, versionDetailLineOf } from './definitions/RecordedVersion.js';
export { compareSemanticVersions, highestSemanticVersion, isSemanticVersion } from './definitions/SemanticVersion.js';
export {
	EXECUTION_ID_LENGTH,
	generateExecutionId,
	isExecutionId,
	looksLikeExecutionId,
} from './execution/ExecutionId.js';

export type {
	AttemptOrigin,
	AttemptOutcome,
	AttemptOverflow,
	AttemptRecord,
	ExecutionState,
	VersionChoice,
	ExecutionStatus,
	RecordedValue,
	StepIoRecord,
	StepState,
	StepStatus,
} from './execution/ExecutionState.js';
export {
	type AttemptCost,
	type CostTotal,
	type StepCostBasis,
	type StepCostInput,
	type StepCostSummary,
	formatStepCost,
	sumStepCosts,
	summarizeStepCost,
} from './execution/StepCost.js';

export { createRemoteDaemonClient, isUnknownCommandError, outdatedDaemonMessage } from './daemon/RemoteDaemonClient.js';
export { DEFAULT_HISTORY_LIMIT, RECOVERED_STATUS, filterExecutions } from './history/ExecutionFilter.js';
export type { ExecutionFilterOptions, FilteredExecutions } from './history/ExecutionFilter.js';
export {
	createRegistryProjectLookup,
	createRegistryProjectLookupFromEnv,
	projectLabelOf,
} from './project/ProjectLabel.js';
export type { ProjectLookup, ProjectLookupResult } from './project/ProjectLabel.js';
export { countByStatus } from './history/StatusCounts.js';
export type { StatusCounts } from './history/StatusCounts.js';
export { summarizeFlows } from './history/FlowSummaries.js';
export { buildRunDigest } from './history/RunDigest.js';
export type { RunDigest } from './history/RunDigest.js';
export type { LatestRunRow } from './history/RunRows.js';
export type { DailyRunCount } from './history/RunTrend.js';
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
export { renderStepIoLines } from './show/StepIoLines.js';
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
export { LOG_LEVELS, attemptOf, formatRecordedStepOutput, readExecutionLogs } from './logs/ExecutionLogs.js';
export type { LogRecordStep } from './logs/LogRecordStep.js';
export type { ExecutionLogEntry, ExecutionLogQuery, ExecutionLogTarget, ExecutionLogs } from './logs/ExecutionLogs.js';
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
	ExecutionLogsView,
	FlowQueryDirectories,
	FlowQueryServiceOptions,
	QueriedExecutions,
	RenderedHistory,
	WorkerListResult,
} from './query/FlowQueryService.js';

export { classifyFlowError, httpAnswerOfFlowError, httpStatusOfFlowError } from './ErrorClassification.js';
export type { FlowErrorCategory, HttpErrorAnswer } from './ErrorClassification.js';
export {
	ellipsize,
	outcomeLabel,
	requireTimestamp,
	runLabel,
	shortStarted,
	startedLabel,
	statusTag,
	stepStatusTag,
} from './view/CellText.js';
export type { OutcomeNotes } from './view/CellText.js';
export {
	FLOW_HEALTHS,
	FLOW_HEALTH_ANY,
	countByHealth,
	filterFlowSummaries,
	flowHealth,
	groupByHealth,
	readFlowIndexFilter,
} from './query/FlowIndex.js';
export type { FlowHealth, FlowHealthGroup, FlowIndexFilter } from './query/FlowIndex.js';
export {
	type IntegerBounds,
	type QueryParams,
	optionalBoolean,
	optionalInteger,
	optionalString,
	readPageOffset,
} from './query/QueryParameters.js';
export {
	MAX_COUNTED_RETRIES,
	NO_RETRY_LEFT,
	RETRY_BADGE_VARIANTS,
	retryLabel,
	retryPoliciesOf,
} from './view/RetryBadge.js';
export type { StepRetryFacts, StepRetryPolicy } from './view/RetryBadge.js';
export { readRecordedRetryPolicies, readRetryPolicies } from './view/RetryPolicyFile.js';
export { toExecutionDetail, toExecutionSummary } from './view/ExecutionView.js';
export type { ExecutionDetailView, ExecutionSummary, StepAttemptView, StepView } from './view/ExecutionView.js';

export { buildFlowGraph } from './graph/FlowGraphBuilder.js';
export { annotateGraph } from './graph/RunGraphAnnotation.js';
export { computeRunPath, isEdgeTraversed } from './graph/RunPath.js';
export type { AttemptKind, RunOutcome, StepRunPath } from './graph/RunPath.js';
export { stripAnsi } from './logs/AnsiStrip.js';
export {
	stripErrorsForServing,
	stripForServing,
	stripIoForServing,
	stripRecordForServing,
} from './logs/ServingText.js';
export { describeStepIO, findDataLinks, referencedInputNames } from './graph/StepIO.js';
export type {
	CappedText,
	DeclaredInput,
	DeclaredOutput,
	RecordedStepIO,
	StepDataLink,
	StepIO,
} from './graph/StepIO.js';
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

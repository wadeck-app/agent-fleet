import { createTypedFetch } from '@framework/api/api-base';
import { FLOW_DAEMON_API_ROUTES } from '@shared/api/flow-daemon.contract';
import type {
	FlowExecutionDetail,
	FlowExecutionLogsQuery,
	FlowExecutionLogsResponse,
	FlowExecutionsQuery,
	FlowExecutionsResponse,
	FlowLogsQuery,
	FlowLogsResponse,
	FlowPluginDetail,
	FlowPluginsResponse,
	FlowSummariesResponse,
	FlowWorkersResponse,
} from '@shared/api/flow-daemon.contract';

/**
 * ===========================================================================================
 * FLOW DAEMON API CLIENT (read-only)
 * ===========================================================================================
 *
 * Type-safe client generated from FLOW_DAEMON_API_ROUTES.
 *
 * ===========================================================================================
 */

const typedFetch = createTypedFetch(FLOW_DAEMON_API_ROUTES);

/**
 * The contract query schemas validate the raw strings of a URL query, while the typed query
 * carries parsed values (numbers, booleans). Validating those against the schema would log a
 * spurious warning on every call; the server validates the real request.
 */
const SKIP_QUERY_VALIDATION = 'silent' as const;

export const flowDaemonApi = {
	getExecutions: (query: FlowExecutionsQuery): Promise<FlowExecutionsResponse> => {
		return typedFetch('GET', '/api/flow-daemon/executions', { query, validationMode: SKIP_QUERY_VALIDATION });
	},

	getExecution: (executionId: string): Promise<FlowExecutionDetail> => {
		return typedFetch('GET', '/api/flow-daemon/executions/:id', {
			params: { id: encodeURIComponent(executionId) },
		});
	},

	getExecutionLogs: (executionId: string, query: FlowExecutionLogsQuery): Promise<FlowExecutionLogsResponse> => {
		return typedFetch('GET', '/api/flow-daemon/executions/:id/logs', {
			params: { id: encodeURIComponent(executionId) },
			query,
			validationMode: SKIP_QUERY_VALIDATION,
		});
	},

	getFlows: (): Promise<FlowSummariesResponse> => {
		return typedFetch('GET', '/api/flow-daemon/flows', {});
	},

	getLogs: (query: FlowLogsQuery): Promise<FlowLogsResponse> => {
		return typedFetch('GET', '/api/flow-daemon/logs', { query, validationMode: SKIP_QUERY_VALIDATION });
	},

	getWorkers: (): Promise<FlowWorkersResponse> => {
		return typedFetch('GET', '/api/flow-daemon/workers', {});
	},

	getPlugins: (): Promise<FlowPluginsResponse> => {
		return typedFetch('GET', '/api/flow-daemon/plugins', {});
	},

	getPlugin: (pluginId: string): Promise<FlowPluginDetail> => {
		return typedFetch('GET', '/api/flow-daemon/plugins/:id', {
			params: { id: encodeURIComponent(pluginId) },
		});
	},
} as const;

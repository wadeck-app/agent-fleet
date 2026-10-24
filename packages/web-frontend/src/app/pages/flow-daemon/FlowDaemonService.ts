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
	FlowWorkersResponse,
} from '@shared/api/flow-daemon.contract';

import { flowDaemonApi } from './flowDaemon.api';
import type { FlowExecutionStatus } from './flowDaemonFormat';

/**
 * ===========================================================================================
 * FLOW DAEMON SERVICE
 * ===========================================================================================
 *
 * Business logic layer for the read-only flow daemon pages.
 * - Builds backend queries from UI state (unset filters are omitted, never sent empty)
 * - Always asks for human-formatted logs
 *
 * Does NOT contain React hooks (see the use* hooks) nor UI components.
 *
 * ===========================================================================================
 */

export interface ListExecutionsParams {
	/** Zero-based page, as expected by the backend. */
	page: number;
	limit: number;
	status: FlowExecutionStatus | undefined;
	flow: string | undefined;
}

export interface GetLogsParams {
	/** UTC day `YYYY-MM-DD`; an empty value means today (backend default). */
	date: string;
	lines: number;
}

export interface GetExecutionLogsParams {
	executionId: string;
	/** Only this step's lines; undefined means every step. */
	step: string | undefined;
	/** Only this level; undefined means every level. */
	level: string | undefined;
	/** Case-insensitive substring of the message; empty means no text filter. */
	q: string;
	/** Zero-based page counted from the END of the matching lines (0 is the tail). */
	page: number;
	limit: number;
}

export class FlowDaemonService {
	async listExecutions(params: ListExecutionsParams): Promise<FlowExecutionsResponse> {
		const query: FlowExecutionsQuery = { page: params.page, limit: params.limit };
		if (params.status !== undefined) {
			query.status = params.status;
		}
		if (params.flow !== undefined) {
			query.flow = params.flow;
		}
		return flowDaemonApi.getExecutions(query);
	}

	async getExecution(executionId: string): Promise<FlowExecutionDetail> {
		return flowDaemonApi.getExecution(executionId);
	}

	async getExecutionLogs(params: GetExecutionLogsParams): Promise<FlowExecutionLogsResponse> {
		const query: FlowExecutionLogsQuery = { page: params.page, limit: params.limit };
		if (params.step !== undefined && params.step !== '') {
			query.step = params.step;
		}
		if (params.level !== undefined && params.level !== '') {
			query.level = params.level;
		}
		if (params.q !== '') {
			query.q = params.q;
		}
		return flowDaemonApi.getExecutionLogs(params.executionId, query);
	}

	/** Flow ids that have at least one execution, sorted for display. */
	async listFlowIds(): Promise<string[]> {
		const response = await flowDaemonApi.getFlows();
		return response.flows.map(flow => flow.flowId).sort((a, b) => a.localeCompare(b));
	}

	async getLogs(params: GetLogsParams): Promise<FlowLogsResponse> {
		const query: FlowLogsQuery = { lines: params.lines, human: true };
		if (params.date !== '') {
			query.date = params.date;
		}
		return flowDaemonApi.getLogs(query);
	}

	async getWorkers(): Promise<FlowWorkersResponse> {
		return flowDaemonApi.getWorkers();
	}

	async listPlugins(): Promise<FlowPluginsResponse> {
		return flowDaemonApi.getPlugins();
	}

	async getPlugin(pluginId: string): Promise<FlowPluginDetail> {
		return flowDaemonApi.getPlugin(pluginId);
	}
}

export const flowDaemonService = new FlowDaemonService();

import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowDaemonService } from './FlowDaemonService';
import { flowDaemonApi } from './flowDaemon.api';

vi.mock('./flowDaemon.api', () => ({
	flowDaemonApi: {
		getExecutions: vi.fn(),
		getExecution: vi.fn(),
		getExecutionLogs: vi.fn(),
		getFlows: vi.fn(),
		getLogs: vi.fn(),
		getWorkers: vi.fn(),
		getPlugins: vi.fn(),
		getPlugin: vi.fn(),
	},
}));

describe('FlowDaemonService', () => {
	let service: FlowDaemonService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new FlowDaemonService();
	});

	describe('listExecutions', () => {
		it('sends the zero-based page and limit, and omits unset filters', async () => {
			(flowDaemonApi.getExecutions as Mock).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

			await service.listExecutions({ page: 0, limit: 20, status: undefined, flow: undefined });

			expect(flowDaemonApi.getExecutions).toHaveBeenCalledWith({ page: 0, limit: 20 });
		});

		it('sends the status and flow filters when set', async () => {
			(flowDaemonApi.getExecutions as Mock).mockResolvedValue({ items: [], total: 0, limit: 10, offset: 20 });

			await service.listExecutions({ page: 2, limit: 10, status: 'failed', flow: 'nightly' });

			expect(flowDaemonApi.getExecutions).toHaveBeenCalledWith({
				page: 2,
				limit: 10,
				status: 'failed',
				flow: 'nightly',
			});
		});

		it('propagates the API error untouched so the UI can show its actionable text', async () => {
			const failure = new Error('Flow daemon history directory is not readable');
			(flowDaemonApi.getExecutions as Mock).mockRejectedValue(failure);

			await expect(
				service.listExecutions({ page: 0, limit: 20, status: undefined, flow: undefined })
			).rejects.toBe(failure);
		});
	});

	describe('listFlowIds', () => {
		it('returns the flow ids sorted', async () => {
			(flowDaemonApi.getFlows as Mock).mockResolvedValue({
				flows: [
					{ flowId: 'zeta', executionCount: 1, failedCount: 0, lastStartedAt: '2026-01-01T00:00:00Z' },
					{ flowId: 'alpha', executionCount: 2, failedCount: 1, lastStartedAt: '2026-01-02T00:00:00Z' },
				],
			});

			await expect(service.listFlowIds()).resolves.toEqual(['alpha', 'zeta']);
		});
	});

	describe('getLogs', () => {
		it('always asks for human-formatted logs', async () => {
			(flowDaemonApi.getLogs as Mock).mockResolvedValue({ filePath: 'f', exists: true, text: '', size: 0 });

			await service.getLogs({ date: '2026-02-03', lines: 500 });

			expect(flowDaemonApi.getLogs).toHaveBeenCalledWith({ date: '2026-02-03', lines: 500, human: true });
		});

		it('omits the date when it is empty so that the backend uses today', async () => {
			(flowDaemonApi.getLogs as Mock).mockResolvedValue({ filePath: 'f', exists: true, text: '', size: 0 });

			await service.getLogs({ date: '', lines: 200 });

			expect(flowDaemonApi.getLogs).toHaveBeenCalledWith({ lines: 200, human: true });
		});
	});

	describe('getExecutionLogs', () => {
		it('sends only the page and limit when no filter is set', async () => {
			(flowDaemonApi.getExecutionLogs as Mock).mockResolvedValue({ entries: [] });

			await service.getExecutionLogs({
				executionId: 'e1',
				step: undefined,
				level: undefined,
				q: '',
				page: 0,
				limit: 100,
			});

			expect(flowDaemonApi.getExecutionLogs).toHaveBeenCalledWith('e1', { page: 0, limit: 100 });
		});

		it('sends the step, level and text filters when set', async () => {
			(flowDaemonApi.getExecutionLogs as Mock).mockResolvedValue({ entries: [] });

			await service.getExecutionLogs({
				executionId: 'e1',
				step: '__execution',
				level: 'error',
				q: 'timeout',
				page: 2,
				limit: 100,
			});

			expect(flowDaemonApi.getExecutionLogs).toHaveBeenCalledWith('e1', {
				page: 2,
				limit: 100,
				step: '__execution',
				level: 'error',
				q: 'timeout',
			});
		});
	});

	describe('pass-through calls', () => {
		it('delegates execution, workers and plugin lookups to the API client', async () => {
			(flowDaemonApi.getExecution as Mock).mockResolvedValue({ executionId: 'e1' });
			(flowDaemonApi.getWorkers as Mock).mockResolvedValue({ workers: [] });
			(flowDaemonApi.getPlugins as Mock).mockResolvedValue({ plugins: [] });
			(flowDaemonApi.getPlugin as Mock).mockResolvedValue({ id: 'p1' });

			await service.getExecution('e1');
			await service.getWorkers();
			await service.listPlugins();
			await service.getPlugin('p1');

			expect(flowDaemonApi.getExecution).toHaveBeenCalledWith('e1');
			expect(flowDaemonApi.getWorkers).toHaveBeenCalledTimes(1);
			expect(flowDaemonApi.getPlugins).toHaveBeenCalledTimes(1);
			expect(flowDaemonApi.getPlugin).toHaveBeenCalledWith('p1');
		});
	});
});

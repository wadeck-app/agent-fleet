import { AsyncLocalStorage } from 'async_hooks';
import { createLogger } from 'shared-common/logger';

const log = createLogger('ApiStats');

export interface ApiCallStats {
	requestId: string;
	method: string;
	path: string;
	callCount: number;
	calls: ApiCallDetail[];
	startTime: number;
	endTime?: number;
	duration?: number;
}

export interface ApiCallDetail {
	operation: string;
	timestamp: number;
	duration?: number;
	success: boolean;
	error?: string;
	retryCount?: number;
}

class ApiStatsManager {
	private asyncLocalStorage = new AsyncLocalStorage<ApiCallStats>();
	private allStats: ApiCallStats[] = [];
	private readonly MAX_STORED_STATS = 1000;

	startRequest(requestId: string, method: string, path: string): void {
		const stats: ApiCallStats = {
			requestId,
			method,
			path,
			callCount: 0,
			calls: [],
			startTime: Date.now(),
		};
		this.asyncLocalStorage.enterWith(stats);
	}

	recordApiCall(operation: string, duration: number, success: boolean, error?: string, retryCount: number = 0): void {
		const stats = this.asyncLocalStorage.getStore();
		if (!stats) {
			return;
		}

		stats.callCount++;
		stats.calls.push({
			operation,
			timestamp: Date.now(),
			duration,
			success,
			error,
			retryCount,
		});
	}

	endRequest(): ApiCallStats | null {
		const stats = this.asyncLocalStorage.getStore();
		if (!stats) {
			return null;
		}

		stats.endTime = Date.now();
		stats.duration = stats.endTime - stats.startTime;

		if (stats.callCount > 1) {
			const operations = stats.calls.map(c => `${c.operation}@${c.duration}ms`).join(', ');
			log.warn(
				`GSS Warning: ${stats.method} ${stats.path} -> ${stats.callCount} calls in ${stats.duration}ms: [${operations}]`
			);
		} else if (stats.callCount === 1) {
			const op = stats.calls[0];
			log.debug(`GSS Stats: ${stats.method} ${stats.path} -> ${op.operation}@${op.duration}ms`);
		}

		this.storeStats(stats);
		return stats;
	}

	private storeStats(stats: ApiCallStats): void {
		this.allStats.push(stats);
		if (this.allStats.length > this.MAX_STORED_STATS) {
			this.allStats.shift();
		}
	}

	getStats(): ApiCallStats[] {
		return [...this.allStats];
	}

	getStatsSummary(): {
		totalRequests: number;
		requestsWithMultipleCalls: number;
		averageCallsPerRequest: number;
		maxCallsInRequest: number;
		totalApiCalls: number;
	} {
		const totalRequests = this.allStats.length;
		const requestsWithMultipleCalls = this.allStats.filter(s => s.callCount > 1).length;
		const totalApiCalls = this.allStats.reduce((sum, s) => sum + s.callCount, 0);
		const averageCallsPerRequest = totalRequests > 0 ? totalApiCalls / totalRequests : 0;
		const maxCallsInRequest = Math.max(...this.allStats.map(s => s.callCount), 0);

		return {
			totalRequests,
			requestsWithMultipleCalls,
			averageCallsPerRequest,
			maxCallsInRequest,
			totalApiCalls,
		};
	}

	clearStats(): void {
		this.allStats = [];
	}
}

export const apiStatsManager = new ApiStatsManager();

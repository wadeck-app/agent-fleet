import type { WorkerFlows } from '@shared/api/flows.contract';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { workersApi } from '../workers.api';
import { useWorkerFlows } from './useWorkerFlows';

// Mock the workers API
vi.mock('../workers.api', () => ({
	workersApi: {
		getWorkerFlows: vi.fn(),
	},
}));

describe('useWorkerFlows', () => {
	const mockFlows = [
		{ id: 'flow-1', version: '1.0', hash: 'abc', name: 'Test Flow 1', description: '', inputs: {}, isValid: true },
		{ id: 'flow-2', version: '1.0', hash: 'def', name: 'Test Flow 2', description: '', inputs: {}, isValid: false },
	] as unknown as WorkerFlows;

	it('fetches flows successfully', async () => {
		vi.mocked(workersApi.getWorkerFlows).mockResolvedValue(mockFlows);

		const { result } = renderHook(() => useWorkerFlows('worker-1'));

		// Initial loading state
		expect(result.current.isLoading).toBe(true);
		expect(result.current.flows).toEqual([]);

		// Wait for data to load
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Success state
		expect(result.current.flows).toEqual(mockFlows);
		expect(result.current.isError).toBe(false);
		expect(result.current.error).toBe(null);
	});

	it('handles error when fetch fails', async () => {
		const errorMessage = 'Failed to fetch worker flows';
		vi.mocked(workersApi.getWorkerFlows).mockRejectedValue(new Error(errorMessage));

		const { result } = renderHook(() => useWorkerFlows('worker-1'));

		// Wait for error state
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Error state
		expect(result.current.isError).toBe(true);
		expect(result.current.error?.message).toBe(errorMessage);
		expect(result.current.flows).toEqual([]);
	});

	it('returns empty flows array when no flows available', async () => {
		vi.mocked(workersApi.getWorkerFlows).mockResolvedValue([]);

		const { result } = renderHook(() => useWorkerFlows('worker-1'));

		// Wait for data to load
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Success state with empty flows
		expect(result.current.flows).toEqual([]);
		expect(result.current.isError).toBe(false);
		expect(result.current.error).toBe(null);
	});

	it('refetches flows silently', async () => {
		vi.mocked(workersApi.getWorkerFlows).mockResolvedValue(mockFlows);

		const { result } = renderHook(() => useWorkerFlows('worker-1'));

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.flows).toEqual(mockFlows);
		});

		// Update mock data
		const updatedFlows = [
			{
				id: 'flow-3',
				version: '1.0',
				hash: 'ghi',
				name: 'Test Flow 3',
				description: '',
				inputs: {},
				isValid: true,
			},
		] as unknown as WorkerFlows;
		vi.mocked(workersApi.getWorkerFlows).mockResolvedValue(updatedFlows);

		// Call refetch
		result.current.refetch();

		// Wait for refetch to complete
		await waitFor(() => {
			expect(result.current.flows).toEqual(updatedFlows);
		});

		// Should not show loading state during refetch
		expect(result.current.isLoading).toBe(false);
	});
});

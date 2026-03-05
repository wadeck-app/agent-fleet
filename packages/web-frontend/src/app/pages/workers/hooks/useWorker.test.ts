import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { workersApi } from '../workers.api';
import { useWorker } from './useWorker';

// Mock the workers API
vi.mock('../workers.api', () => ({
	workersApi: {
		getWorker: vi.fn(),
	},
}));

describe('useWorker', () => {
	const mockWorker = {
		workerId: 'worker-1',
		name: 'Test Worker',
		connected: true,
		state: 'idle' as const,
		version: 1,
	};

	it('fetches worker successfully', async () => {
		vi.mocked(workersApi.getWorker).mockResolvedValue(mockWorker);

		const { result } = renderHook(() => useWorker('worker-1'));

		// Initial loading state
		expect(result.current.isLoading).toBe(true);
		expect(result.current.worker).toBe(null);

		// Wait for data to load
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Success state
		expect(result.current.worker).toEqual(mockWorker);
		expect(result.current.isError).toBe(false);
		expect(result.current.error).toBe(null);
	});

	it('handles error when fetch fails', async () => {
		const errorMessage = 'Failed to fetch worker';
		vi.mocked(workersApi.getWorker).mockRejectedValue(new Error(errorMessage));

		const { result } = renderHook(() => useWorker('worker-1'));

		// Wait for error state
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Error state
		expect(result.current.isError).toBe(true);
		expect(result.current.error?.message).toBe(errorMessage);
		expect(result.current.worker).toBe(null);
	});

	it('refetches worker silently', async () => {
		vi.mocked(workersApi.getWorker).mockResolvedValue(mockWorker);

		const { result } = renderHook(() => useWorker('worker-1'));

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.worker).toEqual(mockWorker);
		});

		// Update mock data
		const updatedWorker = { ...mockWorker, name: 'Updated Worker' };
		vi.mocked(workersApi.getWorker).mockResolvedValue(updatedWorker);

		// Call refetch
		result.current.refetch();

		// Wait for refetch to complete
		await waitFor(() => {
			expect(result.current.worker).toEqual(updatedWorker);
		});

		// Should not show loading state during refetch
		expect(result.current.isLoading).toBe(false);
	});
});

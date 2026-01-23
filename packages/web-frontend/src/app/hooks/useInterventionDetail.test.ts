import type { Intervention, InterventionResponseSubmit } from '@shared/api/interventions.contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { interventionsApi } from '../pages/interventions/interventions.api';
import { useInterventionDetail } from './useInterventionDetail';

// Mock the interventions API
vi.mock('../pages/interventions/interventions.api', () => ({
	interventionsApi: {
		getIntervention: vi.fn(),
		respondToIntervention: vi.fn(),
	},
}));

describe('useInterventionDetail', () => {
	const mockIntervention: Intervention = {
		id: 'test-intervention-id',
		taskId: 'test-task-id',
		type: 'approval',
		status: 'pending',
		blocking: true,
		source: {
			type: 'agent_tool',
			toolName: 'test-tool',
		},
		version: 1,
		config: {
			title: 'Test Intervention',
			description: 'Test description',
			question: 'Approve this?',
		},
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Data Fetching', () => {
		it('initializes with loading state', () => {
			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
				})
			);

			expect(result.current.loading).toBe(true);
			expect(result.current.intervention).toBe(null);
			expect(result.current.error).toBe(null);
		});

		it('fetches intervention successfully', async () => {
			(interventionsApi.getIntervention as Mock).mockResolvedValue(mockIntervention);

			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
				})
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.intervention).toEqual(mockIntervention);
			expect(result.current.error).toBe(null);
			expect(interventionsApi.getIntervention).toHaveBeenCalledWith('test-id');
		});

		it('handles fetch error', async () => {
			(interventionsApi.getIntervention as Mock).mockRejectedValue(new Error('Failed to fetch'));

			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
				})
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.intervention).toBe(null);
			expect(result.current.error).toBe('Failed to fetch');
		});

		it('does not fetch when interventionId is undefined', async () => {
			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: undefined,
				})
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(interventionsApi.getIntervention).not.toHaveBeenCalled();
			expect(result.current.intervention).toBe(null);
		});

		it('refetches when interventionId changes', async () => {
			(interventionsApi.getIntervention as Mock).mockResolvedValue(mockIntervention);

			const { result, rerender } = renderHook(
				({ id }) =>
					useInterventionDetail({
						interventionId: id,
					}),
				{ initialProps: { id: 'test-id-1' } }
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(interventionsApi.getIntervention).toHaveBeenCalledWith('test-id-1');

			// Change the ID
			rerender({ id: 'test-id-2' });

			await waitFor(() => {
				expect(interventionsApi.getIntervention).toHaveBeenCalledWith('test-id-2');
			});

			expect(interventionsApi.getIntervention).toHaveBeenCalledTimes(2);
		});
	});

	describe('Response Submission', () => {
		beforeEach(() => {
			(interventionsApi.getIntervention as Mock).mockResolvedValue(mockIntervention);
			(interventionsApi.respondToIntervention as Mock).mockResolvedValue({ success: true });
		});

		it('submits approval response successfully', async () => {
			const onSuccess = vi.fn();
			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
					onSuccess,
				})
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.submitResponse(true, 'Test comment');
			});

			const expectedResponse: InterventionResponseSubmit = {
				value: true,
				comment: 'Test comment',
			};

			expect(interventionsApi.respondToIntervention).toHaveBeenCalledWith('test-id', expectedResponse);
			expect(onSuccess).toHaveBeenCalledOnce();
			expect(result.current.error).toBe(null);
		});

		it('submits rejection response successfully', async () => {
			const onSuccess = vi.fn();
			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
					onSuccess,
				})
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.submitResponse(false);
			});

			const expectedResponse: InterventionResponseSubmit = {
				value: false,
				comment: undefined,
			};

			expect(interventionsApi.respondToIntervention).toHaveBeenCalledWith('test-id', expectedResponse);
			expect(onSuccess).toHaveBeenCalledOnce();
		});

		it('handles submission error', async () => {
			const onError = vi.fn();
			(interventionsApi.respondToIntervention as Mock).mockRejectedValue(new Error('Submission failed'));

			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
					onError,
				})
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			await act(async () => {
				await result.current.submitResponse(true);
			});

			expect(result.current.error).toBe('Submission failed');
			expect(onError).toHaveBeenCalledWith('Submission failed');
		});

		it('sets submitting state during submission', async () => {
			let resolveSubmit: (value: unknown) => void;
			const submitPromise = new Promise(resolve => {
				resolveSubmit = resolve;
			});
			(interventionsApi.respondToIntervention as Mock).mockReturnValue(submitPromise);

			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
				})
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Start submission
			act(() => {
				void result.current.submitResponse(true);
			});

			// Should be submitting
			await waitFor(() => {
				expect(result.current.submitting).toBe(true);
			});

			// Resolve submission
			act(() => {
				resolveSubmit({ success: true });
			});

			// Should no longer be submitting
			await waitFor(() => {
				expect(result.current.submitting).toBe(false);
			});
		});

		it('does not submit when interventionId is undefined', async () => {
			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: undefined,
				})
			);

			await act(async () => {
				await result.current.submitResponse(true);
			});

			expect(interventionsApi.respondToIntervention).not.toHaveBeenCalled();
		});
	});

	describe('Error Management', () => {
		it('clears error when clearError is called', async () => {
			(interventionsApi.getIntervention as Mock).mockRejectedValue(new Error('Test error'));

			const { result } = renderHook(() =>
				useInterventionDetail({
					interventionId: 'test-id',
				})
			);

			await waitFor(() => {
				expect(result.current.error).toBe('Test error');
			});

			act(() => {
				result.current.clearError();
			});

			expect(result.current.error).toBe(null);
		});

		it('clears previous error on new fetch', async () => {
			(interventionsApi.getIntervention as Mock).mockRejectedValueOnce(new Error('First error'));

			const { result, rerender } = renderHook(
				({ id }) =>
					useInterventionDetail({
						interventionId: id,
					}),
				{ initialProps: { id: 'test-id-1' } }
			);

			await waitFor(() => {
				expect(result.current.error).toBe('First error');
			});

			// Mock success for second fetch
			(interventionsApi.getIntervention as Mock).mockResolvedValue(mockIntervention);

			rerender({ id: 'test-id-2' });

			await waitFor(() => {
				expect(result.current.error).toBe(null);
			});
		});
	});
});

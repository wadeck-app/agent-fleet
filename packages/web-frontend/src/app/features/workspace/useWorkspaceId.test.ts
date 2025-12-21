import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceId } from './useWorkspaceId';

describe('useWorkspaceId', () => {
	beforeEach(() => {
		// Reset console.warn mock
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('should return 0 when VITE_WORKSPACE_ID is not set', () => {
		vi.stubEnv('VITE_WORKSPACE_ID', undefined as any);
		const { result } = renderHook(() => useWorkspaceId());
		expect(result.current).toBe(0);
	});

	it('should return 0 when VITE_WORKSPACE_ID is "0"', () => {
		vi.stubEnv('VITE_WORKSPACE_ID', '0');
		const { result } = renderHook(() => useWorkspaceId());
		expect(result.current).toBe(0);
	});

	it('should return correct workspace ID for valid values 1-9', () => {
		for (let i = 1; i <= 9; i++) {
			vi.stubEnv('VITE_WORKSPACE_ID', String(i));
			const { result } = renderHook(() => useWorkspaceId());
			expect(result.current).toBe(i);
		}
	});

	it('should return 0 and warn for invalid non-numeric value', () => {
		vi.stubEnv('VITE_WORKSPACE_ID', 'invalid');
		const { result } = renderHook(() => useWorkspaceId());
		expect(result.current).toBe(0);
		expect(console.warn).toHaveBeenCalledWith('Invalid WORKSPACE_ID: invalid. Defaulting to 0.');
	});

	it('should return 0 and warn for negative values', () => {
		vi.stubEnv('VITE_WORKSPACE_ID', '-1');
		const { result } = renderHook(() => useWorkspaceId());
		expect(result.current).toBe(0);
		expect(console.warn).toHaveBeenCalledWith('Invalid WORKSPACE_ID: -1. Defaulting to 0.');
	});

	it('should return 0 and warn for values greater than 9', () => {
		vi.stubEnv('VITE_WORKSPACE_ID', '10');
		const { result } = renderHook(() => useWorkspaceId());
		expect(result.current).toBe(0);
		expect(console.warn).toHaveBeenCalledWith('Invalid WORKSPACE_ID: 10. Defaulting to 0.');
	});
});

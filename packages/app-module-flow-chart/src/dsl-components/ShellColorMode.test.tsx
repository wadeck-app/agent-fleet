import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useShellColorMode } from './ShellColorMode.js';

afterEach(() => document.documentElement.classList.remove('dark', 'light'));

describe('useShellColorMode', () => {
	it('is dark when the shell put the dark class on <html>, light otherwise', () => {
		const { result } = renderHook(() => useShellColorMode());
		expect(result.current).toBe('light');
		document.documentElement.classList.add('dark');
		const dark = renderHook(() => useShellColorMode());
		expect(dark.result.current).toBe('dark');
	});

	it('follows the theme toggle while mounted', async () => {
		const { result } = renderHook(() => useShellColorMode());
		await act(async () => {
			document.documentElement.classList.add('dark');
			await Promise.resolve();
		});
		expect(result.current).toBe('dark');
		await act(async () => {
			document.documentElement.classList.remove('dark');
			await Promise.resolve();
		});
		expect(result.current).toBe('light');
	});
});

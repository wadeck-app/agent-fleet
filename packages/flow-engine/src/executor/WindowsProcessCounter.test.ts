import { describe, expect, it, vi } from 'vitest';

import { WindowsProcessCounter } from './WindowsProcessCounter';

const TASKLIST_OUTPUT = [
	'"System Idle Process","0","Services","0","8 K"',
	'"bash.exe","100","Console","1","3,000 K"',
	'"BASH.EXE","101","Console","1","3,000 K"',
	'"conhost.exe","102","Console","1","4,000 K"',
	'"node.exe","103","Console","1","50,000 K"',
	'"bashful.exe","104","Console","1","1 K"',
	'',
].join('\r\n');

describe('WindowsProcessCounter', () => {
	it('counts bash.exe, conhost.exe and node.exe case-insensitively and by exact image name', async () => {
		const counter = new WindowsProcessCounter(async () => TASKLIST_OUTPUT);
		await expect(counter.count()).resolves.toEqual({
			ok: true,
			counts: { 'bash.exe': 2, 'conhost.exe': 1, 'node.exe': 1 },
		});
	});

	it('reports zero for images that are absent', async () => {
		const counter = new WindowsProcessCounter(async () => '"explorer.exe","1","Console","1","1 K"\r\n');
		await expect(counter.count()).resolves.toEqual({
			ok: true,
			counts: { 'bash.exe': 0, 'conhost.exe': 0, 'node.exe': 0 },
		});
	});

	it('returns an explicit failure with the cause when the runner throws (never silent)', async () => {
		const runner = vi.fn().mockRejectedValue(new Error('spawn tasklist ENOENT'));
		const result = await new WindowsProcessCounter(runner).count();
		expect(result).toEqual({ ok: false, error: 'spawn tasklist ENOENT' });
	});

	it('returns an explicit failure when the runner rejects with a non-Error', async () => {
		const result = await new WindowsProcessCounter(() => Promise.reject('boom')).count();
		expect(result).toEqual({ ok: false, error: 'boom' });
	});
});

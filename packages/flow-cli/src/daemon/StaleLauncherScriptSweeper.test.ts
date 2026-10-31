import { describe, expect, it, vi } from 'vitest';

import { LAUNCHER_SCRIPT_PREFIX, sweepStaleLauncherScripts } from './StaleLauncherScriptSweeper';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const HOUR = 3_600_000;

function nameOf(file: string): string {
	return file.replace(/^T[\\/]/, '');
}

function setup(files: Record<string, number>, unlinkFailures: Record<string, string> = {}) {
	const unlinked: string[] = [];
	const warn = vi.fn();
	const deps = {
		directory: 'T',
		now: () => NOW,
		listDirectory: () => Object.keys(files),
		modifiedAtMs: (file: string) => files[nameOf(file)]!,
		unlink: (file: string) => {
			const name = nameOf(file);
			if (unlinkFailures[name] !== undefined) {
				throw Object.assign(new Error(`failure on ${name}`), { code: unlinkFailures[name] });
			}
			unlinked.push(name);
		},
		warn,
	};
	return { deps, unlinked, warn };
}

describe('sweepStaleLauncherScripts', () => {
	it('removes only flow-daemon-run-*.vbs files older than 24 h', () => {
		const { deps, unlinked } = setup({
			'flow-daemon-run-1.vbs': NOW - 25 * HOUR,
			'flow-daemon-run-2.vbs': NOW - 23 * HOUR,
			'flow-daemon-run-3.txt': NOW - 99 * HOUR,
			'other-flow-daemon-run-4.vbs': NOW - 99 * HOUR,
			'start.vbs': NOW - 99 * HOUR,
		});
		sweepStaleLauncherScripts(deps);
		expect(unlinked).toEqual(['flow-daemon-run-1.vbs']);
		expect(LAUNCHER_SCRIPT_PREFIX).toBe('flow-daemon-run-');
	});

	it('stays silent when the file vanished or is in use (ENOENT, EBUSY, EPERM) and continues', () => {
		const { deps, unlinked, warn } = setup(
			{
				'flow-daemon-run-1.vbs': NOW - 30 * HOUR,
				'flow-daemon-run-2.vbs': NOW - 30 * HOUR,
				'flow-daemon-run-3.vbs': NOW - 30 * HOUR,
				'flow-daemon-run-4.vbs': NOW - 30 * HOUR,
			},
			{ 'flow-daemon-run-1.vbs': 'ENOENT', 'flow-daemon-run-2.vbs': 'EBUSY', 'flow-daemon-run-3.vbs': 'EPERM' }
		);
		expect(() => sweepStaleLauncherScripts(deps)).not.toThrow();
		expect(unlinked).toEqual(['flow-daemon-run-4.vbs']);
		expect(warn).not.toHaveBeenCalled();
	});

	it('reports any other unlink failure on stderr, without throwing', () => {
		const { deps, warn } = setup({ 'flow-daemon-run-1.vbs': NOW - 30 * HOUR }, { 'flow-daemon-run-1.vbs': 'EACCES' });
		expect(() => sweepStaleLauncherScripts(deps)).not.toThrow();
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]![0]).toContain('flow-daemon-run-1.vbs');
		expect(warn.mock.calls[0]![0]).toContain('EACCES');
	});

	it('never throws when the directory cannot be listed, and stays silent when a file vanished before its stat', () => {
		const { deps, warn } = setup({ 'flow-daemon-run-1.vbs': 0 });
		expect(() =>
			sweepStaleLauncherScripts({
				...deps,
				modifiedAtMs: () => {
					throw Object.assign(new Error('gone'), { code: 'ENOENT' });
				},
			})
		).not.toThrow();
		expect(warn).not.toHaveBeenCalled();
		expect(() =>
			sweepStaleLauncherScripts({
				...deps,
				listDirectory: () => {
					throw Object.assign(new Error('no access'), { code: 'EACCES' });
				},
			})
		).not.toThrow();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

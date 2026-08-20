import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { readAndClearUpdateState, scheduleBackgroundUpdate } from './UpdateManager';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('UpdateManager', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('scheduleBackgroundUpdate', () => {
		it('returns early when updater file does not exist (dev mode)', () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			scheduleBackgroundUpdate('/some/dir/launcher.cjs', 'my-pkg');

			expect(spawn).not.toHaveBeenCalled();
		});

		it('spawns detached process when updater exists', () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			const mockChild = { unref: vi.fn() };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			vi.mocked(spawn).mockReturnValue(mockChild as any);

			scheduleBackgroundUpdate('/some/dir/launcher.cjs', 'my-pkg');

			expect(spawn).toHaveBeenCalledWith(
				process.execPath,
				[path.join('/some/dir', 'flow-updater.cjs')],
				expect.objectContaining({
					detached: true,
					stdio: 'ignore',
					env: expect.objectContaining({
						LAUNCHER_BUNDLE_OVERRIDE: '/some/dir/launcher.cjs',
						UPDATER_PKG_NAME: 'my-pkg',
					}),
				})
			);
		});

		it('calls child.unref()', () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			const mockChild = { unref: vi.fn() };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			vi.mocked(spawn).mockReturnValue(mockChild as any);

			scheduleBackgroundUpdate('/some/dir/launcher.cjs', 'my-pkg');

			expect(mockChild.unref).toHaveBeenCalled();
		});
	});

	describe('readAndClearUpdateState', () => {
		it('returns null when state file does not exist', () => {
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
			});

			expect(readAndClearUpdateState('/some/config')).toBeNull();
		});

		it('parses and returns state when file exists', () => {
			const state = { status: 'success', newVersion: '1.2.3', timestamp: '2024-01-01T00:00:00Z' };
			vi.mocked(fs.readFileSync).mockImplementation(() => JSON.stringify(state));
			vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

			const result = readAndClearUpdateState('/some/config');

			expect(result).toEqual(state);
		});

		it.each(['success', 'rolled-back', 'update-failed'] as const)(
			'deletes the state file for terminal status: %s',
			status => {
				vi.mocked(fs.readFileSync).mockImplementation(() =>
					JSON.stringify({ status, timestamp: '2024-01-01T00:00:00Z' })
				);
				vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

				readAndClearUpdateState('/some/config');

				expect(fs.unlinkSync).toHaveBeenCalledWith(path.join('/some/config', 'update-state.json'));
			}
		);

		it('does NOT delete state file for "applying" status', () => {
			vi.mocked(fs.readFileSync).mockImplementation(() =>
				JSON.stringify({ status: 'applying', timestamp: '2024-01-01T00:00:00Z' })
			);
			vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

			const result = readAndClearUpdateState('/some/config');

			expect(result?.status).toBe('applying');
			expect(fs.unlinkSync).not.toHaveBeenCalled();
		});

		it('returns null and does not throw when state file contains invalid JSON', () => {
			vi.mocked(fs.readFileSync).mockImplementation(() => 'invalid json{{{');

			expect(() => readAndClearUpdateState('/some/config')).not.toThrow();
			expect(readAndClearUpdateState('/some/config')).toBeNull();
		});
	});
});

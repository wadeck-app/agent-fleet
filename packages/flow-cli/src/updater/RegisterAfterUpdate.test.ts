import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_MODULES } from '../daemon/AppModules';
import { readAppModuleVersion, registerAfterUpdate, trackAppModuleUpdate } from './RegisterAfterUpdate';

let installDir: string;
let manifestPath: string;
const register = vi.fn();
let lines: string[];
const log = (line: string): void => {
	lines.push(line);
};

function writeManifest(content: string): void {
	mkdirSync(join(installDir, 'app-module'), { recursive: true });
	writeFileSync(manifestPath, content);
}

beforeEach(() => {
	installDir = mkdtempSync(join(tmpdir(), 'register-after-update-'));
	manifestPath = join(installDir, 'app-module', 'manifest.json');
	lines = [];
	register.mockReset();
	register.mockResolvedValue(undefined);
});

afterEach(() => {
	rmSync(installDir, { recursive: true, force: true });
});

describe('readAppModuleVersion', () => {
	it('returns the version written in the manifest', () => {
		writeManifest(JSON.stringify({ version: '2026.10.18-131-abc' }));
		expect(readAppModuleVersion(manifestPath)).toEqual({ version: '2026.10.18-131-abc' });
	});

	it('reports a missing manifest as absent, not as an error (an older install has no app-module)', () => {
		expect(readAppModuleVersion(manifestPath)).toEqual({ absent: true });
	});

	it('reports an unreadable manifest with the reason', () => {
		writeManifest('{not json');
		expect(readAppModuleVersion(manifestPath)).toMatchObject({ error: expect.stringContaining('manifest.json') });
	});

	it('reports a manifest without a version string (the source manifest is not registrable)', () => {
		writeManifest(JSON.stringify({ id: 'flow' }));
		expect(readAppModuleVersion(manifestPath)).toMatchObject({ error: expect.stringContaining('"version"') });
	});
});

describe('registerAfterUpdate', () => {
	it('registers when the installed app-module version changed during the update', async () => {
		writeManifest(JSON.stringify({ version: '2' }));
		await registerAfterUpdate({ manifestPath, before: { version: '1' }, register, log, moduleId: 'flow' });
		expect(register).toHaveBeenCalledTimes(1);
		expect(register.mock.calls[0]![0]).toBe(manifestPath);
	});

	it('prints what the registration reports as is', async () => {
		writeManifest(JSON.stringify({ version: '2' }));
		register.mockImplementation(
			async (_path: string, logEntry: (e: { level: string; source: string; message: string }) => void) => {
				logEntry({
					level: 'info',
					source: 'AppCoreRegistration',
					message: 'app-core: module "flow" registered',
				});
			}
		);
		await registerAfterUpdate({ manifestPath, before: { version: '1' }, register, log, moduleId: 'flow' });
		expect(lines).toEqual(['app-core: module "flow" registered']);
	});

	it('registers when the install gained an app-module it did not have before', async () => {
		writeManifest(JSON.stringify({ version: '1' }));
		await registerAfterUpdate({ manifestPath, before: { absent: true }, register, log, moduleId: 'flow' });
		expect(register).toHaveBeenCalledTimes(1);
	});

	it('does nothing, and says nothing, when the version did not change (already up to date, failed or rolled back)', async () => {
		writeManifest(JSON.stringify({ version: '1' }));
		await registerAfterUpdate({ manifestPath, before: { version: '1' }, register, log, moduleId: 'flow' });
		expect(register).not.toHaveBeenCalled();
		expect(lines).toEqual([]);
	});

	it('says nothing when there is no app-module before or after', async () => {
		await registerAfterUpdate({ manifestPath, before: { absent: true }, register, log, moduleId: 'flow' });
		expect(register).not.toHaveBeenCalled();
		expect(lines).toEqual([]);
	});

	it('warns when the app-module disappeared from the install', async () => {
		await registerAfterUpdate({ manifestPath, before: { version: '1' }, register, log, moduleId: 'flow' });
		expect(register).not.toHaveBeenCalled();
		expect(lines.join('\n')).toContain('no longer ships the app-module "flow"');
	});

	it('warns, with the reason, when the new manifest cannot be read', async () => {
		writeManifest('{not json');
		await registerAfterUpdate({ manifestPath, before: { version: '1' }, register, log, moduleId: 'flow' });
		expect(register).not.toHaveBeenCalled();
		expect(lines.join('\n')).toContain('manifest.json');
	});
});

describe('trackAppModuleUpdate', () => {
	const PKG = '@wadeck-app/flow-cli';
	let npmRoot: string;
	let warnings: string[];
	const warn = (line: string): void => {
		warnings.push(line);
	};
	const installManifest = (version: string): void => {
		const dir = join(npmRoot, PKG, 'app-module');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version }));
	};

	beforeEach(() => {
		npmRoot = mkdtempSync(join(tmpdir(), 'track-app-module-'));
		warnings = [];
	});

	afterEach(() => {
		rmSync(npmRoot, { recursive: true, force: true });
	});

	it('reads the manifest of the global install BEFORE the update and registers when it changed afterwards', async () => {
		installManifest('1');
		const afterUpdate = trackAppModuleUpdate({ npmRoot, pkgName: PKG, modules: APP_MODULES, register, log, warn });
		installManifest('2');
		await afterUpdate();
		expect(register).toHaveBeenCalledTimes(1);
		expect(register.mock.calls[0]![0]).toBe(join(npmRoot, PKG, 'app-module', 'manifest.json'));
		expect(register.mock.calls[0]![2]).toBe('flow');
		expect(warnings).toEqual([]);
	});

	it('does not register when the update left the app-module unchanged', async () => {
		installManifest('1');
		const afterUpdate = trackAppModuleUpdate({ npmRoot, pkgName: PKG, modules: APP_MODULES, register, log, warn });
		await afterUpdate();
		expect(register).not.toHaveBeenCalled();
	});

	it('registers a package that gained an app-module with the update', async () => {
		const afterUpdate = trackAppModuleUpdate({ npmRoot, pkgName: PKG, modules: APP_MODULES, register, log, warn });
		installManifest('1');
		await afterUpdate();
		expect(register).toHaveBeenCalledTimes(1);
	});

	it('warns and registers nothing when "npm root -g" failed, instead of staying silent', async () => {
		const afterUpdate = trackAppModuleUpdate({
			npmRoot: undefined,
			pkgName: PKG,
			modules: APP_MODULES,
			register,
			log,
			warn,
		});
		await afterUpdate();
		expect(register).not.toHaveBeenCalled();
		expect(warnings).toEqual(['app-core: not re-registering the app-modules, "npm root -g" failed earlier']);
	});

	it('forwards the registration diagnostics to the log', async () => {
		register.mockImplementation(
			async (_path: string, sink: (e: { level: string; source: string; message: string }) => void) => {
				sink({ level: 'info', source: 'app-core', message: 'app-core: registered flow' });
			}
		);
		const afterUpdate = trackAppModuleUpdate({ npmRoot, pkgName: PKG, modules: APP_MODULES, register, log, warn });
		installManifest('1');
		await afterUpdate();
		expect(lines).toEqual(['app-core: registered flow']);
	});

	it('never throws: a failing registration is reported as a warning with the reason', async () => {
		register.mockRejectedValue(new Error('boom'));
		const afterUpdate = trackAppModuleUpdate({ npmRoot, pkgName: PKG, modules: APP_MODULES, register, log, warn });
		installManifest('1');
		await expect(afterUpdate()).resolves.toBeUndefined();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('boom');
		expect(warnings[0]).toContain('flow cli update');
	});

	describe('with flow-chart', () => {
		const installChart = (version: string): void => {
			const dir = join(npmRoot, PKG, 'app-module-flow-chart');
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version }));
		};

		it('re-registers both modules, flow first, when both versions changed', async () => {
			installManifest('1');
			installChart('1');
			const afterUpdate = trackAppModuleUpdate({
				npmRoot,
				pkgName: PKG,
				modules: APP_MODULES,
				register,
				log,
				warn,
			});
			installManifest('2');
			installChart('2');
			await afterUpdate();
			expect(register.mock.calls.map(c => c[2])).toEqual(['flow', 'flow-chart']);
			expect(register.mock.calls[1]![0]).toBe(join(npmRoot, PKG, 'app-module-flow-chart', 'manifest.json'));
		});

		it('registers only the module whose version changed', async () => {
			installManifest('1');
			installChart('1');
			const afterUpdate = trackAppModuleUpdate({
				npmRoot,
				pkgName: PKG,
				modules: APP_MODULES,
				register,
				log,
				warn,
			});
			installChart('2');
			await afterUpdate();
			expect(register.mock.calls.map(c => c[2])).toEqual(['flow-chart']);
		});

		it('registers flow-chart when an older install gains it with the update', async () => {
			installManifest('1');
			const afterUpdate = trackAppModuleUpdate({
				npmRoot,
				pkgName: PKG,
				modules: APP_MODULES,
				register,
				log,
				warn,
			});
			installChart('1');
			await afterUpdate();
			expect(register.mock.calls.map(c => c[2])).toEqual(['flow-chart']);
		});

		it('a failing flow registration does not prevent flow-chart from being registered, and is reported', async () => {
			installManifest('1');
			installChart('1');
			register.mockRejectedValueOnce(new Error('boom'));
			const afterUpdate = trackAppModuleUpdate({
				npmRoot,
				pkgName: PKG,
				modules: APP_MODULES,
				register,
				log,
				warn,
			});
			installManifest('2');
			installChart('2');
			await afterUpdate();
			expect(register.mock.calls.map(c => c[2])).toEqual(['flow', 'flow-chart']);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('"flow"');
			expect(warnings[0]).toContain('boom');
		});
	});
});

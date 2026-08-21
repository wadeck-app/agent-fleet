import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PluginResolver } from './PluginResolver.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// From packages/flow-cli/src/config/ → packages/extension-points/... (3 up)
const REGISTRY_PATH = resolve(__dirname, '..', '..', '..', 'extension-points', 'extension-points.json');
// From packages/flow-cli/src/config/ → packages/ (3 up)
const PACKAGES_DIR = resolve(__dirname, '..', '..', '..');

const tmp = join(tmpdir(), `plugin-resolver-test-${Date.now()}`);

beforeEach(() => mkdirSync(tmp, { recursive: true }));
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('PluginResolver.resolveAll - workspace provider', () => {
	it('resolves plugin-none workspace provider from inline config', async () => {
		const projectConfig = join(tmp, 'config.yml');
		writeFileSync(
			projectConfig,
			`
plugins:
  workspace:
    instance:
      type: plugins.none.default
`,
			'utf8'
		);

		const result = await PluginResolver.create({
			globalConfigPath: join(tmp, 'missing.yml'),
			projectConfigPath: projectConfig,
			pluginPackagesDir: PACKAGES_DIR,
			registryPath: REGISTRY_PATH,
		}).resolveAll();

		expect(result.workspaceProvider).toBeDefined();
		const handle = await result.workspaceProvider!.allocate({ taskId: 'test-task' });
		expect(handle.id).toBe('none:test-task');
		await result.workspaceProvider!.release(handle);
	});

	it('throws when workspace is not configured', async () => {
		await expect(
			PluginResolver.create({
				globalConfigPath: join(tmp, 'missing.yml'),
				projectConfigPath: join(tmp, 'missing-project.yml'),
				pluginPackagesDir: PACKAGES_DIR,
				registryPath: REGISTRY_PATH,
			}).resolveAll()
		).rejects.toThrow(/no workspace provider configured/i);
	});

	it('throws when workspace.type is missing', async () => {
		const projectConfig = join(tmp, 'config.yml');
		writeFileSync(
			projectConfig,
			`
plugins:
  workspace:
    instance: {}
`,
			'utf8'
		);
		await expect(
			PluginResolver.create({
				globalConfigPath: join(tmp, 'missing.yml'),
				projectConfigPath: projectConfig,
				pluginPackagesDir: PACKAGES_DIR,
				registryPath: REGISTRY_PATH,
			}).resolveAll()
		).rejects.toThrow(/workspace\.type is required/i);
	});
});

const WORKSPACE_ONLY_CONFIG = `
plugins:
  workspace:
    instance:
      type: plugins.none.default
`;

describe('PluginResolver.resolveAll - approval provider', () => {
	it('returns undefined approval provider when approval not configured', async () => {
		const projectConfig = join(tmp, 'config.yml');
		writeFileSync(projectConfig, WORKSPACE_ONLY_CONFIG, 'utf8');

		const result = await PluginResolver.create({
			globalConfigPath: join(tmp, 'missing.yml'),
			projectConfigPath: projectConfig,
			pluginPackagesDir: PACKAGES_DIR,
			registryPath: REGISTRY_PATH,
		}).resolveAll();

		expect(result.approvalProvider).toBeUndefined();
	});

	it('resolves cli-approval provider from inline config', async () => {
		const projectConfig = join(tmp, 'config.yml');
		writeFileSync(
			projectConfig,
			`
plugins:
  workspace:
    instance:
      type: plugins.none.default
  approval:
    instance:
      type: plugins.cli-approval.default
`,
			'utf8'
		);

		const result = await PluginResolver.create({
			globalConfigPath: join(tmp, 'missing.yml'),
			projectConfigPath: projectConfig,
			pluginPackagesDir: PACKAGES_DIR,
			registryPath: REGISTRY_PATH,
		}).resolveAll();

		expect(result.approvalProvider).toBeDefined();
		expect(typeof result.approvalProvider?.requestApproval).toBe('function');
	});
});

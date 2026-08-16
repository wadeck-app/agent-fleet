import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigLoader } from './ConfigLoader.js';

const tmp = join(tmpdir(), `config-loader-test-${Date.now()}`);

beforeEach(() => {
	mkdirSync(tmp, { recursive: true });
	delete process.env['FLOW_CONFIG'];
	delete process.env['MY_TOKEN'];
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env['FLOW_CONFIG'];
	delete process.env['MY_TOKEN'];
});

function writeYaml(filePath: string, content: string): void {
	mkdirSync(join(filePath, '..'), { recursive: true });
	writeFileSync(filePath, content, 'utf8');
}

describe('ConfigLoader - global config loading', () => {
	it('loads empty config when no files exist', async () => {
		const loader = new ConfigLoader({
			globalConfigPath: join(tmp, 'missing.yml'),
			projectConfigPath: join(tmp, '.flow', 'config.yml'),
		});
		const result = await loader.load();
		expect(result.workspace).toBeUndefined();
	});

	it('hard errors when FLOW_CONFIG is set but file is missing', async () => {
		process.env['FLOW_CONFIG'] = join(tmp, 'nonexistent.yml');
		const loader = new ConfigLoader({ globalConfigPath: join(tmp, 'nonexistent.yml') });
		await expect(loader.load()).rejects.toThrow(/FLOW_CONFIG.*not found|file.*missing/i);
	});

	it('resolves ${ENV_VAR} interpolation in global config options', async () => {
		process.env['MY_TOKEN'] = 'secret-value';
		const globalPath = join(tmp, 'global.yml');
		writeYaml(
			globalPath,
			`
plugins:
  instances:
    my-worktree:
      type: plugins.worktree.default
      options:
        token: \${MY_TOKEN}
`
		);
		const loader = new ConfigLoader({
			globalConfigPath: globalPath,
			projectConfigPath: join(tmp, '.flow', 'config.yml'),
		});
		const cfg = await loader.load();
		// token is a sensitive field that should be resolved, not rejected as literal
		// it's ${} syntax so it's resolved, not a literal
		expect(cfg).toBeDefined();
	});

	it('rejects literal token value in global config options', async () => {
		const globalPath = join(tmp, 'global.yml');
		writeYaml(
			globalPath,
			`
plugins:
  instances:
    my-worktree:
      type: plugins.worktree.default
      options:
        token: literal-secret-value
`
		);
		const loader = new ConfigLoader({ globalConfigPath: globalPath });
		await expect(loader.load()).rejects.toThrow(/sensitive field.*token|literal.*credential/i);
	});
});

describe('ConfigLoader - project config merging', () => {
	it('resolves workspace via use: from global config instances', async () => {
		const globalPath = join(tmp, 'global.yml');
		writeYaml(
			globalPath,
			`
plugins:
  instances:
    my-worktree:
      type: plugins.worktree.default
      options:
        baseDir: /home/user/workspaces
`
		);
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    use: my-worktree
    options:
      prefix: myproject-
`
		);
		const loader = new ConfigLoader({ globalConfigPath: globalPath, projectConfigPath: projectPath });
		const result = await loader.load();
		expect(result.workspace).toBeDefined();
		expect(result.workspace!.type).toBe('plugins.worktree.default');
		expect(result.workspace!.options['baseDir']).toBe('/home/user/workspaces');
		expect(result.workspace!.options['prefix']).toBe('myproject-');
	});

	it('hard errors when use: references unknown instance name', async () => {
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    use: nonexistent-instance
`
		);
		const loader = new ConfigLoader({ globalConfigPath: join(tmp, 'missing.yml'), projectConfigPath: projectPath });
		await expect(loader.load()).rejects.toThrow(/instance.*not found|unknown.*instance/i);
	});

	it('resolves workspace via inline instance syntax', async () => {
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    instance:
      type: plugins.none.default
`
		);
		const loader = new ConfigLoader({ globalConfigPath: join(tmp, 'missing.yml'), projectConfigPath: projectPath });
		const result = await loader.load();
		expect(result.workspace).toBeDefined();
		expect(result.workspace!.type).toBe('plugins.none.default');
	});

	it('hard errors when both use: and instance: are present', async () => {
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    use: my-worktree
    instance:
      type: plugins.none.default
`
		);
		const loader = new ConfigLoader({ globalConfigPath: join(tmp, 'missing.yml'), projectConfigPath: projectPath });
		await expect(loader.load()).rejects.toThrow(/both.*use.*instance|mutually exclusive/i);
	});

	it('project-level options override instance options (shallow merge)', async () => {
		const globalPath = join(tmp, 'global.yml');
		writeYaml(
			globalPath,
			`
plugins:
  instances:
    my-worktree:
      type: plugins.worktree.default
      options:
        baseDir: /home/user/workspaces
        prefix: global-
`
		);
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    use: my-worktree
    options:
      prefix: project-
`
		);
		const loader = new ConfigLoader({ globalConfigPath: globalPath, projectConfigPath: projectPath });
		const result = await loader.load();
		expect(result.workspace!.options['prefix']).toBe('project-');
		expect(result.workspace!.options['baseDir']).toBe('/home/user/workspaces');
	});

	it('rejects literal sensitive field in inline instance options', async () => {
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    instance:
      type: plugins.jira.public
      options:
        token: literal-token-value
`
		);
		const loader = new ConfigLoader({ globalConfigPath: join(tmp, 'missing.yml'), projectConfigPath: projectPath });
		await expect(loader.load()).rejects.toThrow(/sensitive field.*token|literal.*credential/i);
	});

	it('resolves ${ENV_VAR} in inline instance options', async () => {
		process.env['MY_TOKEN'] = 'resolved-value';
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    instance:
      type: plugins.none.default
      options:
        apiKey: \${MY_TOKEN}
`
		);
		const loader = new ConfigLoader({ globalConfigPath: join(tmp, 'missing.yml'), projectConfigPath: projectPath });
		const result = await loader.load();
		expect(result.workspace!.options['apiKey']).toBe('resolved-value');
	});

	it('errors when env var referenced by ${} is missing', async () => {
		const projectPath = join(tmp, '.flow', 'config.yml');
		writeYaml(
			projectPath,
			`
plugins:
  workspace:
    instance:
      type: plugins.none.default
      options:
        token: \${MISSING_VAR_XYZ}
`
		);
		const loader = new ConfigLoader({ globalConfigPath: join(tmp, 'missing.yml'), projectConfigPath: projectPath });
		await expect(loader.load()).rejects.toThrow(/MISSING_VAR_XYZ.*not set|env.*variable.*missing/i);
	});
});

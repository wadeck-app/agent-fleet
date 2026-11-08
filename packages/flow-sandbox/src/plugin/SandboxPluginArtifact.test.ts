import { PluginLoader } from 'flow-cli/src/config/PluginLoader';
import { WorkerTypeInstances } from 'flow-cli/src/daemon/WorkerTypeInstances';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PluginBundler } from '../PluginBundler';
import { MOCK_SBX_PATH, MockSbxHarness } from '../testing/MockSbxHarness';

// The BUILT artifact (not the source), copied where no node_modules can be reached (the temp directory), loaded by flow's REAL
// PluginLoader and WorkerTypeInstances. Built here, so CI needs no prior `npm run bundle`.
let root: string;
let pluginsDirectory: string;
let sizes: Record<string, number>;

beforeAll(async () => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-artifact-'));
	pluginsDirectory = path.join(root, 'dist-plugin');
	sizes = (await new PluginBundler().bundle(pluginsDirectory)).files;
}, 120_000);

afterAll(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('the sandbox plugin artifact', () => {
	it('contains the plugin, the wrapper bundle and the MCP server the engine looks for next to it', () => {
		expect(Object.keys(sizes).sort()).toEqual(['mcp-server.cjs', 'plugin.config.js', 'wrapper.cjs']);
		// The plugin stays small (it is read by the daemon); the wrapper carries the engine.
		expect(sizes['plugin.config.js']).toBeLessThan(40_000);
		expect(sizes['wrapper.cjs']).toBeGreaterThan(200_000);
	});

	it('runs under plain node with no node_modules: the plugin imports, the wrapper bundle starts and refuses a bad option', () => {
		const probe = path.join(root, 'probe.mjs');
		fs.writeFileSync(
			probe,
			`import(${JSON.stringify(pathToFileURL(path.join(pluginsDirectory, 'plugin-sandbox', 'plugin.config.js')).href)}).then(m => console.log(m.manifest.pluginId));`
		);

		const imported = spawnSync(process.execPath, [probe], { cwd: root, encoding: 'utf8' });
		const wrapper = spawnSync(
			process.execPath,
			[path.join(pluginsDirectory, 'plugin-sandbox', 'wrapper.cjs'), 'preflight', '--bad-option'],
			{
				cwd: root,
				encoding: 'utf8',
				env: {
					...process.env,
					FLOW_DAEMON_WS_URL: 'ws://127.0.0.1:0',
					FLOW_WORKER_SOURCE_ID: 's',
					FLOW_WORKER_TOKEN: 't',
				},
			}
		);

		expect(imported.stdout.trim()).toBe('sandbox');
		expect(wrapper.status).toBe(1);
		expect(wrapper.stderr).toContain("Unknown option '--bad-option'");
		expect(wrapper.stderr).toContain('wrapper.cjs preflight');
	});

	// Decision 26: leftovers are listed and removed by an explicit command. The artifact is all a user has (no source checkout, no tsx),
	// so the command ships in it: `wrapper.cjs leftover list | remove <name> [--force]`.
	it('ships the leftover command: list shows a plugin sandbox, remove removes exactly that one, a bad command is a usage error', async () => {
		const harness = new MockSbxHarness();
		try {
			const workspace = harness.makeDirectory('ws-');
			await harness.runtime().create({
				name: 'flow-sbx-w1-run1',
				agent: 'shell',
				mounts: [{ hostPath: workspace }],
				cpus: 2,
				memory: '2g',
			});
			await harness.runtime().create({
				name: 'someone-elses',
				agent: 'shell',
				mounts: [{ hostPath: workspace }],
				cpus: 2,
				memory: '2g',
			});
			const presence = harness.makeDirectory('presence-');
			const leftover = (...args: string[]): ReturnType<typeof spawnSync> =>
				spawnSync(
					process.execPath,
					[path.join(pluginsDirectory, 'plugin-sandbox', 'wrapper.cjs'), 'leftover', ...args],
					{
						cwd: root,
						encoding: 'utf8',
						env: { ...harness.env(), SBX_PATH: MOCK_SBX_PATH, FLOW_SANDBOX_PRESENCE_DIR: presence },
					}
				);

			const listed = leftover('list');
			const refused = leftover('remove', 'someone-elses');
			const removed = leftover('remove', 'flow-sbx-w1-run1');
			const usage = leftover();

			expect(listed.status, String(listed.stderr)).toBe(0);
			expect(String(listed.stdout)).toContain('flow-sbx-w1-run1');
			expect(String(listed.stdout)).not.toContain('someone-elses');
			// A sandbox without the plugin's marker is never touched.
			expect(refused.status).toBe(1);
			expect(removed.status, String(removed.stderr)).toBe(0);
			const remaining = (await harness.runtime().list()).map(info => info.name);
			expect(remaining).toEqual(['someone-elses']);
			expect(usage.status).toBe(2);
			expect(String(usage.stderr)).toContain('Usage: leftover list');
		} finally {
			harness.dispose();
		}
	}, 60_000);

	it("is built by flow's real loader, its options are parsed, and obtainWorker starts the wrapper with the credential in the environment only", async () => {
		const record = path.join(root, 'launch.json');
		const stub = path.join(root, 'stub.cjs');
		fs.writeFileSync(
			stub,
			[
				"const fs = require('node:fs');",
				"if (process.argv[2] === 'preflight') process.exit(0);",
				`fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ argv: process.argv.slice(2), token: process.env.FLOW_WORKER_TOKEN, endpoint: process.env.FLOW_DAEMON_WS_URL, source: process.env.FLOW_WORKER_SOURCE_ID }));`,
				'setTimeout(() => process.exit(0), 1500);',
			].join('\n')
		);
		process.env['FLOW_SANDBOX_PLUGIN_WRAPPER'] = stub;
		const logged: string[] = [];
		const instances = new WorkerTypeInstances(new PluginLoader(), (_level, message) => logged.push(message));
		try {
			const instance = await instances.get(
				{
					sourceId: 'sandbox-1',
					provider: 'sandbox',
					plugin: 'sandbox.exec',
					pluginsDir: pluginsDirectory,
					labels: [],
					maxWorkers: 1,
					options: { projects: 'ab12cd34', region: 'us-east-1', profiles: 'claude=my-profile' },
				} as never,
				{ issueLaunchToken: () => 'per-ask-secret', revokeLaunchToken: () => undefined }
			);

			const spawned = await instance.source.obtainWorker({
				daemonEndpoint: 'ws://127.0.0.1:4101',
				sourceId: 'sandbox-1',
				projects: [],
			});
			for (let attempt = 0; attempt < 100 && !fs.existsSync(record); attempt += 1) {
				await new Promise(resolve => setTimeout(resolve, 50));
			}

			// The contract of flow's core: { launched: true } keeps the credential, { launched: false } (nothing started) gives it back.
			expect(spawned).toEqual({ launched: true });
			expect(
				await instance.source.obtainWorker({
					daemonEndpoint: 'ws://127.0.0.1:4101',
					sourceId: 'sandbox-1',
					projects: [],
				})
			).toEqual({ launched: false });

			const launch = JSON.parse(fs.readFileSync(record, 'utf8')) as {
				argv: string[];
				token: string;
				endpoint: string;
				source: string;
			};
			expect(launch).toMatchObject({
				token: 'per-ask-secret',
				endpoint: 'ws://127.0.0.1:4101',
				source: 'sandbox-1',
			});
			expect(launch.argv).toContain('--project-id');
			expect(launch.argv).toContain('claude=my-profile');
			expect(JSON.stringify(launch.argv)).not.toContain('per-ask-secret');
			expect(logged.join('\n')).toContain('answered by the plugins directory');
			await instance.dispose();
		} finally {
			await instances.disposeAll();
			delete process.env['FLOW_SANDBOX_PLUGIN_WRAPPER'];
		}
	}, 60_000);
});

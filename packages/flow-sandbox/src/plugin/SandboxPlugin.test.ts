import { LaunchCredentialSource } from 'flow-cli/src/daemon/LaunchCredentialSource';
import { LaunchTokenIssuer } from 'flow-cli/src/daemon/LaunchTokenIssuer';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The plugin is plain JavaScript that a user's daemon loads from a directory (see plugin/plugin.config.js): it is imported
// by file URL here, exactly like the daemon's loader does, never through the TypeScript sources.
const PLUGIN_FILE = fileURLToPath(new URL('../../plugin/plugin.config.js', import.meta.url));

interface WorkerRequest {
	daemonEndpoint: string;
	authToken?: string;
	sourceId: string;
	projects: string[];
}
interface Instance {
	source: { obtainWorker(request: WorkerRequest): Promise<void> };
	dispose(): Promise<void>;
	run?: unknown;
}
interface PluginModule {
	manifest: {
		pluginId: string;
		implementations: Record<
			string,
			Record<
				string,
				{ version: number; provider(context: { sourceId: string; options: unknown }): Promise<Instance> }
			>
		>;
	};
	internals: {
		parseOptions(raw: unknown): Record<string, unknown>;
		wrapperId(sourceId: string): string;
		wrapperArguments(parsed: Record<string, unknown>, sourceId: string): string[];
		setSpawn(implementation: unknown): void;
	};
}

let counter = 0;
async function load(file = PLUGIN_FILE): Promise<PluginModule> {
	counter += 1;
	return (await import(`${pathToFileURL(file).href}?load=${counter}`)) as PluginModule;
}

const GOOD = {
	projects: 'ab12cd34',
	region: 'us-east-1',
	profiles: 'claude=my-sso-profile',
};

let root: string;
let stubLog: string;

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-plugin-'));
	stubLog = path.join(root, 'stub.log');
	const stub = path.join(root, 'stub-wrapper.cjs');
	fs.writeFileSync(
		stub,
		[
			"const fs = require('node:fs');",
			'const env = process.env; const here = __dirname; const mode = (fs.existsSync(here + "/mode") ? fs.readFileSync(here + "/mode", "utf8") : "").trim();',
			'fs.appendFileSync(here + "/stub.log", JSON.stringify({ argv: process.argv.slice(2), env: { FLOW_DAEMON_WS_URL: env.FLOW_DAEMON_WS_URL, FLOW_WORKER_SOURCE_ID: env.FLOW_WORKER_SOURCE_ID, FLOW_WORKER_TOKEN: env.FLOW_WORKER_TOKEN, SBX_PATH: env.SBX_PATH }, keys: Object.keys(env) }) + \'\\n\');',
			"if (process.argv[2] === 'preflight') {",
			"  if (mode === 'preflight-fails') { process.stderr.write('sbx 0.1.0 is installed but 0.49.2 is required: install it from the release page\\n'); process.exit(1); }",
			'  process.exit(0);',
			'}',
			"const half = Math.floor((env.FLOW_WORKER_TOKEN || '').length / 2);",
			"if (mode === 'split-chunks') { process.stderr.write('boom ' + env.FLOW_WORKER_TOKEN.slice(0, half)); setTimeout(() => { process.stderr.write(env.FLOW_WORKER_TOKEN.slice(half) + ' end\\n'); process.exit(3); }, 150); return; }",
			"if (mode === 'split-lines') { process.stderr.write('boom ' + env.FLOW_WORKER_TOKEN.slice(0, half) + '\\n' + env.FLOW_WORKER_TOKEN.slice(half) + ' end\\n'); process.exit(3); }",
			"if (mode === 'crash') { process.stderr.write('boom ' + env.FLOW_WORKER_TOKEN + ' (credential in the message)\\n'); process.exit(3); }",
			'setInterval(() => undefined, 1000);',
		].join('\n')
	);
	process.env['FLOW_SANDBOX_PLUGIN_WRAPPER'] = stub;
	process.env['FLOW_SANDBOX_PLUGIN_DISPOSE_MS'] = '600';
	// The default presence directory of the machine must not influence a test.
	process.env['FLOW_SANDBOX_PRESENCE_DIR'] = path.join(root, 'presence');
});

afterEach(() => {
	for (const key of ['FLOW_SANDBOX_PLUGIN_WRAPPER', 'FLOW_SANDBOX_PLUGIN_DISPOSE_MS', 'FLOW_SANDBOX_PRESENCE_DIR']) {
		delete process.env[key];
	}
	fs.rmSync(root, { recursive: true, force: true });
});

async function build(options: Record<string, string> = GOOD, sourceId = 'sandbox-1'): Promise<Instance> {
	const plugin = await load();
	return plugin.manifest.implementations['worker-type']!['exec']!.provider({ sourceId, options });
}

function request(overrides: Partial<WorkerRequest> = {}): WorkerRequest {
	return {
		daemonEndpoint: 'ws://127.0.0.1:4101',
		authToken: 'launch-secret-token',
		sourceId: 'sandbox-1',
		projects: [],
		...overrides,
	};
}

function launches(): { argv: string[]; env: Record<string, string> }[] {
	if (!fs.existsSync(stubLog)) return [];
	return fs
		.readFileSync(stubLog, 'utf8')
		.split('\n')
		.filter(line => line !== '')
		.map(line => JSON.parse(line) as { argv: string[]; env: Record<string, string> })
		.filter(launch => launch.argv[0] !== 'preflight');
}

function setMode(mode: string): void {
	fs.writeFileSync(path.join(root, 'mode'), mode);
}

async function waitFor(condition: () => boolean, what: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (condition()) return;
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	throw new Error(`timed out waiting for ${what}`);
}

describe('sandbox plugin: the manifest', () => {
	it('is plugin "sandbox", implementation "exec" of the worker-type point, and has no run hook (the wrapper ends runs itself)', async () => {
		const plugin = await load();
		const implementation = plugin.manifest.implementations['worker-type']?.['exec'];

		expect(plugin.manifest.pluginId).toBe('sandbox');
		expect(implementation?.version).toBe(1);
		expect((await build()).run).toBeUndefined();
	});
});

describe('sandbox plugin: options are flat strings and parsed strictly', () => {
	it.each([
		{
			label: 'projects is required',
			options: { region: 'us-east-1', profiles: 'claude=p' },
			fragment: 'projects',
			example: 'projects=ab12cd34',
		},
		{
			label: 'region is required',
			options: { projects: 'a1', profiles: 'claude=p' },
			fragment: 'region',
			example: 'region=us-east-1',
		},
		{
			label: 'profiles is required',
			options: { projects: 'a1', region: 'us-east-1' },
			fragment: 'profiles',
			example: 'profiles=claude=my-sso-profile',
		},
		{
			label: 'an unknown option (a typo is not a default)',
			options: { ...GOOD, cpu: '2' },
			fragment: 'Unknown option "cpu"',
			example: 'cpus',
		},
		{
			label: 'an empty value',
			options: { ...GOOD, image: '' },
			fragment: 'option "image" is empty',
			example: 'image=flow-sandbox:m7',
		},
		{
			label: 'a blank value',
			options: { ...GOOD, memory: '   ' },
			fragment: 'option "memory" is empty',
			example: 'memory=2g',
		},
		{
			label: 'a value that is not a string',
			options: { ...GOOD, cpus: 2 },
			fragment: 'option "cpus" must be a string',
			example: 'cpus=2',
		},
		{
			label: 'an empty list item',
			options: { ...GOOD, projects: 'a1,,b2' },
			fragment: 'empty item',
			example: 'projects=ab12cd34,ef56ab78',
		},
		{
			label: 'a duplicate project id',
			options: { ...GOOD, projects: 'a1,a1' },
			fragment: 'twice',
			example: 'projects=ab12cd34',
		},
		{
			label: 'a profile entry without "="',
			options: { ...GOOD, profiles: 'claude' },
			fragment: 'alias=profile',
			example: 'profiles=claude=my-sso-profile',
		},
		{
			label: 'a profile name with a comma (not expressible: the comma separates entries)',
			options: { ...GOOD, profiles: 'claude=a,b' },
			fragment: 'comma',
			example: 'profiles=claude=my-sso-profile',
		},
		{
			label: 'two profile aliases (the exec wrapper serves one in v1)',
			options: { ...GOOD, profiles: 'a=x,b=y' },
			fragment: 'exactly one',
			example: 'profiles=claude=my-sso-profile',
		},
		{ label: 'a fractional cpus', options: { ...GOOD, cpus: '1.5' }, fragment: 'whole number', example: 'cpus=2' },
		{
			label: 'a memory below the sbx minimum',
			options: { ...GOOD, memory: '256m' },
			fragment: 'at least 512m',
			example: 'memory=2g',
		},
		{
			label: 'an idle delay over 24 hours',
			options: { ...GOOD, idleStopMinutes: '1441' },
			fragment: 'at most 1440',
			example: 'idleStopMinutes=5',
		},
		{
			label: 'a pull policy that does not exist',
			options: { ...GOOD, pull: 'sometimes' },
			fragment: 'always, missing or never',
			example: 'pull=never',
		},
		{
			label: 'a host without a port',
			options: { ...GOOD, extraAllowedHosts: 'registry.example.org' },
			fragment: 'host:port',
			example: 'extraAllowedHosts=registry.example.org:443',
		},
		{
			label: 'a boolean that is not true or false',
			options: { ...GOOD, acceptSshAgentForwarding: 'yes' },
			fragment: 'true or false',
			example: 'acceptSshAgentForwarding=true',
		},
		{
			label: 'a name from the prototype chain (toString)',
			options: JSON.parse('{"projects":"a1","region":"us-east-1","profiles":"c=p","toString":"x"}') as Record<
				string,
				string
			>,
			fragment: 'Unknown option "toString"',
			example: 'cpus',
		},
		{
			label: 'the name __proto__',
			options: JSON.parse('{"projects":"a1","region":"us-east-1","profiles":"c=p","__proto__":"x"}') as Record<
				string,
				string
			>,
			fragment: 'Unknown option "__proto__"',
			example: 'cpus',
		},
		{
			label: 'an image that is an option (leading dash)',
			options: { ...GOOD, image: '--pull' },
			fragment: 'must not start with "-"',
			example: 'image=flow-sandbox:m7',
		},
		{
			label: 'a value over 512 characters',
			options: { ...GOOD, image: 'a'.repeat(513) },
			fragment: 'at most 512 characters',
			example: 'image=flow-sandbox:m7',
		},
		{
			label: 'a control character in a value',
			options: { ...GOOD, region: 'us-east-1\u0007' },
			fragment: 'control character',
			example: 'region=us-east-1',
		},
		{
			label: 'an sbx path that is a directory',
			options: { ...GOOD, sbxPath: os.tmpdir() },
			fragment: 'must be a file',
			example: 'sbxPath=',
		},
		{
			label: 'an sbx path on a network share',
			options: { ...GOOD, sbxPath: '\\\\server\\share\\sbx.exe' },
			fragment: 'network path',
			example: 'sbxPath=',
		},
		{
			label: 'a relative sbx path',
			options: { ...GOOD, sbxPath: 'sbx.exe' },
			fragment: 'absolute',
			example: 'sbxPath=',
		},
	])('refuses $label, naming the option and giving an example', async ({ options, fragment, example }) => {
		const plugin = await load();

		let message = '';
		try {
			plugin.internals.parseOptions(options);
		} catch (error) {
			message = (error as Error).message;
		}

		expect(message).toContain(fragment);
		expect(message).toContain(example);
	});

	it('turns valid options into the wrapper command line: "=" splits a profile at the first one, nothing secret is in it', async () => {
		const plugin = await load();
		const parsed = plugin.internals.parseOptions({
			...GOOD,
			projects: 'ab12cd34,ef56ab78',
			profiles: 'claude=sso=prod',
			image: 'flow-sandbox:m7',
			pull: 'never',
			cpus: '3',
			memory: '4G',
			maxConcurrentSandboxes: '2',
			idleStopMinutes: '0.5',
			extraAllowedHosts: 'a.example.org:443,*.npmjs.org:443',
			acceptSshAgentForwarding: 'true',
		});

		const argv = plugin.internals.wrapperArguments(parsed, 'sandbox-1');

		expect(argv).toEqual([
			'--wrapper-id',
			plugin.internals.wrapperId('sandbox-1'),
			'--project-id',
			'ab12cd34',
			'--project-id',
			'ef56ab78',
			'--profile',
			'claude=sso=prod',
			'--region',
			'us-east-1',
			'--image',
			'flow-sandbox:m7',
			'--pull',
			'never',
			'--cpus',
			'3',
			'--memory',
			'4g',
			'--max-sandboxes',
			'2',
			'--idle-minutes',
			'0.5',
			'--extra-allowed-host',
			'a.example.org:443',
			'--extra-allowed-host',
			'*.npmjs.org:443',
			'--accept-ssh-agent-forwarding',
		]);
		expect(plugin.internals.wrapperId('sandbox-1')).toMatch(/^[a-z0-9]{1,12}$/);
		expect(plugin.internals.wrapperId('sandbox-1')).not.toBe(plugin.internals.wrapperId('sandbox-2'));
	});
});

describe('sandbox plugin: the factory refuses to build with a plain message that says how to fix it', () => {
	it.each([
		{
			label: 'a missing option',
			setup: () => undefined,
			options: { region: 'us-east-1', profiles: 'claude=p' },
			fragment: 'projects',
		},
		{
			label: 'a wrapper.cjs that is not next to the plugin',
			setup: () => {
				process.env['FLOW_SANDBOX_PLUGIN_WRAPPER'] = path.join(root, 'missing', 'wrapper.cjs');
			},
			options: GOOD,
			fragment: 'npm run bundle --workspace flow-sandbox',
		},
		{
			label: 'a failed environment check (sbx missing, wrong version, not signed in, image unknown)',
			setup: () => {
				setMode('preflight-fails');
			},
			options: GOOD,
			fragment: '0.49.2 is required',
		},
	])('$label', async ({ setup, options, fragment }) => {
		setup();

		await expect(build(options)).rejects.toThrow(fragment);
	});
});

describe('sandbox plugin: obtainWorker', () => {
	it('spawns the wrapper with the launch credential in its environment, never on its command line', async () => {
		const instance = await build({ ...GOOD, sbxPath: process.execPath });

		await instance.source.obtainWorker(request());
		await waitFor(() => launches().length === 1, 'the wrapper to start');

		const [launch] = launches();
		expect(launch?.env).toEqual({
			FLOW_DAEMON_WS_URL: 'ws://127.0.0.1:4101',
			FLOW_WORKER_SOURCE_ID: 'sandbox-1',
			FLOW_WORKER_TOKEN: 'launch-secret-token',
			SBX_PATH: process.execPath,
		});
		expect(JSON.stringify(launch?.argv)).not.toContain('launch-secret-token');
		await instance.dispose();
	});

	it('does not start a second wrapper while one of this source is alive (one wrapper = one worker)', async () => {
		const instance = await build();

		await instance.source.obtainWorker(request());
		await waitFor(() => launches().length === 1, 'the wrapper to start');
		await instance.source.obtainWorker(request());
		await new Promise(resolve => setTimeout(resolve, 300));

		expect(launches()).toHaveLength(1);
		await instance.dispose();
	});

	it('says what is missing when the daemon gave no launch credential, and spawns nothing', async () => {
		const instance = await build();

		await expect(instance.source.obtainWorker(request({ authToken: undefined }))).rejects.toThrow('authToken');
		expect(launches()).toHaveLength(0);
	});

	it('re-throws the failure of a wrapper that died after the previous ask, redacted, once; the ask after that starts a new one', async () => {
		setMode('crash');
		const instance = await build();

		await instance.source.obtainWorker(request());
		await waitFor(() => launches().length === 1, 'the wrapper to start');
		await new Promise(resolve => setTimeout(resolve, 400));

		const failure = await instance.source.obtainWorker(request()).then(
			() => undefined,
			(error: Error) => error
		);
		expect(failure?.message).toContain('exited with code 3');
		expect(failure?.message).toContain('boom');
		expect(failure?.message).not.toContain('launch-secret-token');
		expect(launches()).toHaveLength(1);

		setMode('');
		await instance.source.obtainWorker(request());
		await waitFor(() => launches().length === 2, 'a new wrapper');
		await instance.dispose();
	});
});

describe('sandbox plugin: what the wrapper process is given and how it fails', () => {
	it('gives the wrapper an allow-listed environment: no provider key or other secret of the daemon, only what it needs', async () => {
		const planted = {
			ANTHROPIC_API_KEY: 'k1',
			OPENAI_API_KEY: 'k2',
			FLOW_HEALTH_TOKEN: 'h',
			SOME_SECRET: 's',
			GITHUB_TOKEN: 'g',
			FLOW_DAEMON_MODE: '1',
		};
		Object.assign(process.env, planted);
		process.env['AWS_PROFILE'] = 'kept';
		try {
			const instance = await build({ ...GOOD, sbxPath: process.execPath });
			await instance.source.obtainWorker(request());
			await waitFor(() => launches().length === 1, 'the wrapper to start');

			const names = (
				JSON.parse(fs.readFileSync(stubLog, 'utf8').trim().split('\n').at(-1) as string) as { keys: string[] }
			).keys;
			for (const name of Object.keys(planted)) expect(names, name).not.toContain(name);
			expect(names).toEqual(
				expect.arrayContaining([
					'FLOW_WORKER_TOKEN',
					'FLOW_DAEMON_WS_URL',
					'FLOW_WORKER_SOURCE_ID',
					'SBX_PATH',
					'AWS_PROFILE',
				])
			);
			expect(names.some(name => /^path$/i.test(name))).toBe(true);
			await instance.dispose();
		} finally {
			for (const name of [...Object.keys(planted), 'AWS_PROFILE']) delete process.env[name];
		}
	});

	it('rejects the ask, in plain words and without an uncaught error, when the process cannot be spawned', async () => {
		const plugin = await load();
		const emitter = new EventEmitter() as EventEmitter & { pid?: number; stderr: PassThrough; unref(): void };
		emitter.stderr = new PassThrough();
		emitter.unref = () => undefined;
		plugin.internals.setSpawn(() => {
			// Node reports a failed spawn as an 'error' event AFTER spawn() returned, with pid undefined.
			setImmediate(() => emitter.emit('error', new Error('spawn ENOENT')));
			return emitter;
		});
		const instance = await plugin.manifest.implementations['worker-type']!['exec']!.provider({
			sourceId: 'sandbox-1',
			options: GOOD,
		});

		await expect(instance.source.obtainWorker(request())).rejects.toThrow('could not be started');
		await new Promise(resolve => setTimeout(resolve, 100));

		// The error event found a listener (an unhandled one would have thrown from emit and failed this run).
		expect(emitter.listenerCount('error')).toBeGreaterThan(0);
	});

	it.each([
		{ mode: 'split-chunks', label: 'a credential split across two chunks' },
		{ mode: 'split-lines', label: 'a credential split across two lines' },
	])('never shows $label in the failure', async ({ mode }) => {
		setMode(mode);
		const instance = await build();
		await instance.source.obtainWorker(request());
		await waitFor(() => launches().length === 1, 'the wrapper to start');
		await new Promise(resolve => setTimeout(resolve, 500));

		const failure = await instance.source.obtainWorker(request()).then(
			() => undefined,
			(error: Error) => error
		);

		expect(failure?.message).toContain('exited with code 3');
		expect(failure?.message).toContain('boom');
		const flat = (failure?.message ?? '').replace(/\s+/g, '');
		expect(flat).not.toContain('launch-secret-token');
		expect(flat).not.toContain('launch-secr');
		expect(flat).not.toContain('et-token');
	});

	it('says on stderr, once per start, that FLOW_SANDBOX_PLUGIN_WRAPPER replaced the wrapper', async () => {
		const written: string[] = [];
		const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
			written.push(String(chunk));
			return true;
		}) as typeof process.stderr.write);
		try {
			await build();
		} finally {
			spy.mockRestore();
		}

		expect(written.join('')).toContain('FLOW_SANDBOX_PLUGIN_WRAPPER');
	});
});

// The daemon mints a credential per ask and caps the outstanding ones at 32 per source; an ask that starts nothing must say so
// ({ launched: false }) so the credential goes back. Through flow's real wrapper of the source and its real issuer.
describe('sandbox plugin: the credential of an ask that starts no wrapper goes back', () => {
	it('reuses a running wrapper 40 times in a row without reaching the cap, and keeps the credential of the ask that spawned', async () => {
		const issuer = new LaunchTokenIssuer();
		const instance = await build();
		const source = new LaunchCredentialSource(
			instance.source,
			sourceId => issuer.issue(sourceId),
			(sourceId, token) => issuer.revoke(sourceId, token)
		);
		const ask = (): Promise<unknown> =>
			source.obtainWorker({ daemonEndpoint: 'ws://127.0.0.1:4101', sourceId: 'sandbox-1', projects: [] });

		const spawned = await ask();
		await waitFor(() => launches().length === 1, 'the wrapper to start');
		let reused = 0;
		for (let index = 0; index < 40; index += 1) {
			const result = await ask();
			if ((result as { launched?: boolean } | undefined)?.launched === false) reused += 1;
		}

		expect(reused).toBe(40);
		expect(launches()).toHaveLength(1);
		// The spawning ask's credential is the one the wrapper was given, and it is still valid for its registration.
		expect((spawned as { launched?: boolean } | undefined)?.launched).toBe(true);
		const given = launches()[0]?.env['FLOW_WORKER_TOKEN'] as string;
		expect(issuer.consume('sandbox-1', given)).toBe(true);
		await instance.dispose();
	});
});

describe('sandbox plugin: dispose', () => {
	it('stops the wrapper within a bound, is idempotent, never throws, and stops asking', async () => {
		const instance = await build();
		await instance.source.obtainWorker(request());
		await waitFor(() => launches().length === 1, 'the wrapper to start');

		await instance.dispose();
		await instance.dispose();

		await expect(instance.source.obtainWorker(request())).rejects.toThrow('disposed');
		expect(launches()).toHaveLength(1);
	});
});

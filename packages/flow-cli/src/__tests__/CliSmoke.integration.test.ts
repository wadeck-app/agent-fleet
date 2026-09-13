/**
 * Does the CLI actually start?
 *
 * This exists because nothing else asks. `npm run check` type-checks, `npm run violations`
 * reads source, and every other suite imports modules through vitest's own resolver -- none
 * of them launch the binary a user launches. A real break got through all three: an import
 * of `shared-common/utils/getErrorMessage` type-checked while the package's `exports` map
 * had no runtime entry for it, so `flow worker --help` died with
 * ERR_PACKAGE_PATH_NOT_EXPORTED and every suite stayed green.
 *
 * Spawns `bin/flow.js`, not `FlowIndex.ts`, because the bin script does its own tsx
 * resolution and is what npm installs. Only commands that touch no daemon and write nothing
 * are used: `--help` alone imports the whole command graph, which is where a resolution or
 * module-level error surfaces.
 */
import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowBin = resolve(__dirname, '..', '..', 'bin', 'flow.js');

/** Signs that the process died on the way up rather than answering. */
const STARTUP_FAILURES = [
	'ERR_PACKAGE_PATH_NOT_EXPORTED',
	'ERR_MODULE_NOT_FOUND',
	'ERR_INVALID_PACKAGE_CONFIG',
	'MODULE_NOT_FOUND',
	'Cannot find module',
	'SyntaxError',
	'cannot locate tsx',
];

function runFlow(args: string[]): { output: string; status: number | null } {
	// Fails loudly rather than skipping: a missing binary is the thing this test is for.
	if (!existsSync(flowBin)) throw new Error(`The flow binary is missing at "${flowBin}"`);

	// The test runner injects its own module loader through NODE_OPTIONS, and that loader
	// resolves specifiers a plain `node` refuses -- an exports map with no runtime entry
	// among them. Inheriting it would make this test agree with vitest instead of with the
	// user's shell, which is the opposite of the point.
	const env = { ...process.env };
	delete env['NODE_OPTIONS'];
	delete env['VITEST'];
	delete env['VITEST_WORKER_ID'];

	const result = spawnSync(process.execPath, [flowBin, ...args], {
		encoding: 'utf8',
		timeout: 60_000,
		env,
		// Deliberately not the package directory, which is where the test runner happens to
		// sit. Module resolution turned out to depend on the working directory: the same
		// command that worked from `packages/flow-cli` died from the repo root. Since a user
		// runs `flow` from their own project, anywhere but here is the honest cwd -- and it is
		// the only reason this test can see the failure at all.
		cwd: tmpdir(),
	});
	if (result.error) throw result.error;
	return { output: (result.stdout ?? '') + (result.stderr ?? ''), status: result.status };
}

function expectStarted(output: string): void {
	for (const marker of STARTUP_FAILURES) {
		expect(output, `the CLI failed during startup:\n${output}`).not.toContain(marker);
	}
}

describe('flow CLI starts', () => {
	it('prints its top-level help', () => {
		const { output, status } = runFlow(['--help']);

		expectStarted(output);
		expect(output).toContain('flow');
		expect(status).toBe(0);
	});

	it('prints its version', () => {
		const { output, status } = runFlow(['--version']);

		expectStarted(output);
		expect(output.trim()).not.toBe('');
		expect(status).toBe(0);
	});

	// One case per command group, so a module-level error in any of them is caught. Help is
	// enough: reaching it means the whole import graph for that group loaded.
	it.each([['run'], ['worker'], ['worker', 'start'], ['worker', 'source'], ['history'], ['logs']])(
		'prints help for "%s"',
		(...command: string[]) => {
			const { output, status } = runFlow([...command, '--help']);

			expectStarted(output);
			expect(status).toBe(0);
		}
	);

	// A CLI that answers an unknown command has finished starting up, and the wording is
	// itself a UX contract (no silent exit).
	it('rejects an unknown command with an actionable line', () => {
		const { output, status } = runFlow(['totally-unknown-xyz']);

		expectStarted(output);
		expect(output).toContain('Unknown command: totally-unknown-xyz');
		expect(status).toBe(1);
	});
});

/**
 * The standalone bundle is what users actually install, and it ships with NO node_modules.
 *
 * `bin/flow.js` above cannot see this class of break: it runs from a checkout where every
 * specifier resolves on disk. The bundle only contains what esbuild traced, and esbuild traces
 * literal `import`/`require` specifiers only -- a `createRequire(...)(...)` call stays a runtime
 * lookup. One such lookup of 'extension-points/extension-points.json' made the daemon of every
 * project declaring a `plugins:` section die before writing a single log line, so `flow run` only
 * ever said "Daemon did not start within 10000ms" and never named the missing module.
 *
 * Hence: copy the real bundle OUT of the repository into a directory with no reachable
 * node_modules -- exactly how it is installed -- spawn it in daemon mode from a project whose
 * config declares plugins, and require that it stays up and publishes its port. Running it in
 * place would prove nothing: from `dist-bundle/` every runtime lookup still resolves through the
 * workspace's own node_modules, which is why this break shipped.
 */
const agentFleetRoot = resolve(__dirname, '..', '..', '..', '..');
const bundlePath = resolve(agentFleetRoot, 'packages', 'flow-cli', 'dist-bundle', 'flow.cjs');

/** The bundler refuses to run without a version, so one is supplied here (see ci/scripts/bundle.ts). */
const TEST_BUNDLE_VERSION = '0.0.0-test-daemon-plugins';

/**
 * Both `plugins.workspace` and `plugins.approval`: each is resolved through PluginLoader, and the
 * registry lookup that broke happens per extension point, so one section alone would leave half
 * the path untested.
 */
const PROJECT_CONFIG_YAML = `\
version: 1
plugins:
  workspace:
    instance:
      type: plugins.none.default
  approval:
    instance:
      type: plugins.cli-approval.default
`;

/** Handle on a spawned daemon, with everything needed to explain a failure. */
interface SpawnedDaemon {
	child: ChildProcess;
	output: () => string;
	exit: () => { code: number | null; signal: NodeJS.Signals | null } | undefined;
}

/**
 * Copies the bundle to an isolated directory, the way `npm i -g` lays it out: one .cjs file and
 * nothing else. `worker.cjs` travels with it because a real install always has both.
 */
function installBundle(installDir: string): string {
	const installedFlow = join(installDir, 'flow.cjs');
	copyFileSync(bundlePath, installedFlow);
	const workerBundle = resolve(bundlePath, '..', 'worker.cjs');
	if (existsSync(workerBundle)) copyFileSync(workerBundle, join(installDir, 'worker.cjs'));
	return installedFlow;
}

function spawnBundledDaemon(installedFlow: string, projectDir: string, configHome: string): SpawnedDaemon {
	const env = { ...process.env };
	// Same reason as runFlow above: vitest's own loader resolves specifiers plain node refuses,
	// which is precisely the difference this test exists to catch.
	delete env['NODE_OPTIONS'];
	delete env['VITEST'];
	delete env['VITEST_WORKER_ID'];
	// Either variable would point the daemon at config outside the isolated directory.
	delete env['FLOW_CONFIG'];
	delete env['FLOW_CONFIG_DIR'];
	// A stray NODE_PATH would hand the isolated copy the repository's modules back.
	delete env['NODE_PATH'];
	// Exactly how `flow run` and `flow start` launch the daemon.
	env['FLOW_DAEMON_MODE'] = '1';
	// ConfigDir.get honours this on every platform, so the daemon dir is XDG_CONFIG_HOME/flow.
	// Without it the test would adopt (and then kill) the developer's own running daemon.
	env['XDG_CONFIG_HOME'] = configHome;

	const child = spawn(process.execPath, [installedFlow], {
		cwd: projectDir,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	let output = '';
	child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
	child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
	let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
	child.on('exit', (code, signal) => (exit = { code, signal }));

	return { child, output: () => output, exit: () => exit };
}

async function stopDaemon(daemon: SpawnedDaemon): Promise<void> {
	if (daemon.exit() !== undefined) return;
	daemon.child.kill();
	for (let attempt = 0; attempt < 50; attempt++) {
		if (daemon.exit() !== undefined) return;
		await new Promise(done => setTimeout(done, 100));
	}
	// Only ever this one child: nothing else is signalled.
	daemon.child.kill('SIGKILL');
}

describe('the standalone bundle in daemon mode', () => {
	beforeAll(() => {
		// `bundle` runs esbuild over dist/, so src must be compiled first or the bundle under test
		// is whatever stale dist/ happens to be on disk. shell: true so npm resolves on Windows.
		for (const script of ['build', 'bundle']) {
			execFileSync('npm', ['run', script, '--workspace', 'packages/flow-cli'], {
				cwd: agentFleetRoot,
				encoding: 'utf-8',
				timeout: 300_000,
				env: { ...process.env, BUNDLE_VERSION: TEST_BUNDLE_VERSION },
				shell: true,
			});
		}
	}, 360_000);

	it('starts and publishes its port for a project that declares plugins', async () => {
		// Fails loudly rather than skipping: a missing bundle means this test proves nothing.
		if (!existsSync(bundlePath)) {
			throw new Error(
				`The standalone bundle is missing at "${bundlePath}". ` +
					`Build it with: BUNDLE_VERSION=${TEST_BUNDLE_VERSION} npm run build --workspace packages/flow-cli && ` +
					`BUNDLE_VERSION=${TEST_BUNDLE_VERSION} npm run bundle --workspace packages/flow-cli`
			);
		}

		const installDir = mkdtempSync(join(tmpdir(), 'flow-bundle-daemon-install-'));
		const projectDir = mkdtempSync(join(tmpdir(), 'flow-bundle-daemon-project-'));
		const configHome = mkdtempSync(join(tmpdir(), 'flow-bundle-daemon-config-'));
		mkdirSync(join(projectDir, '.flow'), { recursive: true });
		writeFileSync(join(projectDir, '.flow', 'config.yml'), PROJECT_CONFIG_YAML, 'utf8');

		const daemon = spawnBundledDaemon(installBundle(installDir), projectDir, configHome);
		try {
			const portFile = join(configHome, 'flow', 'config.port');
			// Generous but bounded: a cold daemon needs a few seconds on Windows.
			const deadline = Date.now() + 45_000;
			while (Date.now() < deadline && !existsSync(portFile) && daemon.exit() === undefined) {
				await new Promise(done => setTimeout(done, 100));
			}

			const exit = daemon.exit();
			expect(
				exit,
				`the daemon exited instead of staying up (code=${String(exit?.code)} signal=${String(exit?.signal)}).\n` +
					`Its own output, which "flow run" never shows:\n${daemon.output() || '(nothing at all)'}`
			).toBeUndefined();
			expect(
				existsSync(portFile),
				`the daemon never wrote "${portFile}", so no client could reach it.\nIts output:\n${daemon.output() || '(nothing at all)'}`
			).toBe(true);
		} finally {
			await stopDaemon(daemon);
			for (const dir of [installDir, projectDir, configHome]) {
				rmSync(dir, { recursive: true, force: true });
			}
		}
	}, 90_000);
});

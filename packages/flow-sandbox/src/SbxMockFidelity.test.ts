import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PINNED_SBX_VERSION } from './PinnedSbxVersion';
import { SbxBinaryLocator } from './SbxBinaryLocator';
import { SbxProcess, type SbxProcessResult } from './SbxProcess';
import { MOCK_SBX_PATH, MockSbxHarness } from './testing/MockSbxHarness';
import { SbxFixtures } from './testing/SbxFixtures';

// Fidelity of the sbx mock against the REAL captured outputs (.claude/docs/mock-fidelity.md).
// What the mock invents (the "synthetic" outputs) is listed in README.md and verified only by the gated live check.
//
// The mock serves the captured help texts itself (it reads the fixture file), so a changed sbx help text never fails
// a test here: it comes with a re-capture of the fixtures, which the mock then serves. What fails is a mock that
// serves something else than its fixture, or that stops deriving the accepted flags from the captured help.

const fixtures = new SbxFixtures();
const harnesses: MockSbxHarness[] = [];

afterEach(() => {
	for (const created of harnesses.splice(0)) created.dispose();
});

function newHarness(scenario?: string): MockSbxHarness {
	const created = new MockSbxHarness(scenario);
	harnesses.push(created);
	return created;
}

function locateMock(): ReturnType<SbxBinaryLocator['locate']> {
	return new SbxBinaryLocator({
		binaryPath: MOCK_SBX_PATH,
		env: process.env,
		platform: process.platform,
		nodeExecutable: process.execPath,
	}).locate();
}

async function runMock(args: string[], harness: MockSbxHarness = newHarness()): Promise<SbxProcessResult> {
	return new SbxProcess().run({ binary: locateMock(), args, env: harness.env(), timeoutMs: 30_000 });
}

describe('captured fixtures', () => {
	it('were captured from the pinned sbx version (a bump forces a re-capture), exist for every command of the manifest with exit 0 for read-only and help commands and 1 for errors, and hold no user name', () => {
		const manifest = fixtures.manifest();

		expect(manifest.sbxVersion).toBe(PINNED_SBX_VERSION);
		expect(fixtures.stdout('version')).toContain(`sbx version v${PINNED_SBX_VERSION} `);
		expect(manifest.commands.length).toBeGreaterThanOrEqual(25);
		for (const command of manifest.commands) {
			// Reading throws when the file is missing.
			const text = fixtures.stdout(command.id) + fixtures.stderr(command.id);
			expect(command.exitCode, command.id).toBe(
				command.id === 'err-exec-missing' ? 125 : command.id.startsWith('err-') ? 1 : 0
			);
			expect(text, command.id).not.toMatch(/C:\\Users\\(?!<user>)[^\\]+/);
		}
	});
});

describe('sbx mock versus the captured outputs', () => {
	it('prints the version, a verb help and the root help byte for byte (the same file path serves every other help)', async () => {
		const cases: [string, string[]][] = [
			['version', ['version']],
			['help-create', ['create', '--help']],
			['help-root', ['--help']],
		];

		const results = await Promise.all(cases.map(([, args]) => runMock(args)));

		cases.forEach(([id], index) => {
			expect(results[index]?.exitCode, id).toBe(0);
			expect(results[index]?.stdout, id).toBe(fixtures.stdout(id));
		});
	});

	it('prints the captured JSON outputs unchanged by default (machine-wide policy only, an empty list as []), and lists a sandbox with exactly the keys of the captured populated entry', async () => {
		const [diagnose, settings, policy, empty] = await Promise.all([
			runMock(['diagnose', '--json']),
			runMock(['settings', 'ls', '--json']),
			runMock(['policy', 'ls', '--json']),
			runMock(['ls', '--json']),
		]);

		expect(JSON.parse(diagnose.stdout)).toEqual(fixtures.json('diagnose-json'));
		expect(JSON.parse(settings.stdout)).toEqual(fixtures.json('settings-ls-json'));
		const captured = fixtures.json('policy-ls-json') as { rules: { scope: string }[] };
		expect(JSON.parse(policy.stdout)).toEqual({
			...captured,
			rules: captured.rules.filter(rule => rule.scope === 'global'),
		});
		expect(captured.rules.some(rule => rule.scope !== 'global')).toBe(true);
		expect(empty.stdout.trim()).toBe('[]');

		const harness = newHarness();
		await harness.runtime().create({
			name: 'keys-1',
			agent: 'shell',
			mounts: [{ hostPath: harness.makeDirectory() }],
			cpus: 2,
			memory: '2g',
		});
		const populated = await runMock(['ls', '--json'], harness);
		const mockEntry = (JSON.parse(populated.stdout) as Record<string, unknown>[])[0];
		const realEntry = (fixtures.json('ls-json') as Record<string, unknown>[])[0];
		expect(Object.keys(mockEntry ?? {}).sort()).toEqual(Object.keys(realEntry ?? {}).sort());
	});

	it('fails with the captured stderr and exit code for a missing sandbox and an unknown verb', async () => {
		const cases: [string, string[]][] = [
			['err-exec-missing', ['exec', 'fs-capture-missing', 'true']],
			['err-stop-missing', ['stop', 'fs-capture-missing']],
			['err-rm-missing', ['rm', '--force', 'fs-capture-missing']],
			['err-unknown-verb', ['nosuchverb']],
		];

		const results = await Promise.all(cases.map(([, args]) => runMock(args)));

		cases.forEach(([id], index) => {
			// `sbx exec` exits 125 for a missing sandbox since 0.51.0, the other verbs 1.
			expect(results[index]?.exitCode, id).toBe(id === 'err-exec-missing' ? 125 : 1);
			expect(results[index]?.stderr, id).toBe(fixtures.stderr(id));
			expect(results[index]?.stdout, id).toBe('');
		});
	});

	it('rejects a flag absent from the captured help, like the real sbx, for each verb the runtime uses', async () => {
		const cases = [
			['create', '--bogus'],
			['exec', '--bogus', 'x', 'true'],
			['stop', '--bogus', 'x'],
			['rm', '--bogus', 'x'],
			['cp', '--bogus', 'a', 'b'],
			['ls', '--bogus'],
			['policy', 'allow', 'network', '--bogus', 'h:1'],
			['policy', 'rm', 'network', '--bogus'],
			['secret', 'set-custom', '--bogus'],
			['diagnose', '--bogus'],
			['policy', 'ls', '--bogus'],
		];

		const results = await Promise.all(cases.map(args => runMock(args)));

		cases.forEach((args, index) => {
			expect(results[index]?.exitCode, args.join(' ')).toBe(1);
			expect(results[index]?.stderr, args.join(' ')).toContain('error: unknown flag: --bogus');
		});
	});

	it('knows the flags the runtime uses from the captured help (guards the parsing of the help text)', async () => {
		// Each of these must be accepted: the mock derives them from the captured help, so a wrong parse shows here.
		const accepted = [
			['create', '--name', 'n', '--cpus', '2', '-m', '2g', '-t', 'img', '--pull', 'never', 'shell'],
			['create', '--name', 'n', '--cpus', '2', '--memory', '2g', 'shell'],
			['exec', '-i', '--env-file', 'x', '-w', '/c', 'n', '--', 'true'],
			['exec', '-e', 'A=1', '--env', 'B=2', 'n', 'true'],
			['rm', '-f', 'n'],
			['policy', 'allow', 'network', '--sandbox', 'n', 'h:1'],
			[
				'secret',
				'set-custom',
				'--sandbox',
				'n',
				'--host',
				'h',
				'--env',
				'E',
				'--placeholder',
				'p',
				'--command',
				'c',
			],
		];

		// Each call has its own state directory: the order of the calls does not matter.
		const results = await Promise.all(accepted.map(args => runMock(args)));

		accepted.forEach((args, index) => {
			// Accepted flags then fail later for state reasons; the unknown-flag error is what must not appear.
			expect(results[index]?.stderr, args.join(' ')).not.toContain('unknown flag');
		});
	});
});

describe('sbx mock versus the captured notices of sbx', () => {
	it('prints the captured banner once on the first bash of a sandbox made without an image, none for an image, and the captured start notice when exec starts a stopped sandbox', async () => {
		const harness = newHarness('bash-canned');
		const workspace = harness.makeDirectory();
		const create = (name: string, ...extra: string[]) =>
			runMock(['create', '--name', name, '--cpus', '2', '-m', '2g', ...extra, 'shell', workspace], harness);
		await create('plain-1');
		await create('image-1', '-t', 'flow-sandbox:test');
		const bash = (name: string) => runMock(['exec', name, '--', 'bash', '-c', 'echo x'], harness);

		const first = await bash('plain-1');
		const second = await bash('plain-1');
		const withImage = await bash('image-1');
		await runMock(['stop', 'plain-1'], harness);
		const restarted = await runMock(['exec', 'plain-1', '--', 'true'], harness);

		const banner = fixtures.stdout('exec-first-after-create');
		expect(banner).toContain('Docker Sandbox');
		expect(first.stdout).toBe(
			banner.replaceAll('<sandbox>', 'plain-1').replaceAll('<workspace>', path.basename(workspace)) +
				'mock-sandbox-output\n'
		);
		expect(second.stdout).toBe('mock-sandbox-output\n');
		expect(withImage.stdout).toBe('mock-sandbox-output\n');
		expect(restarted.stderr).toBe(fixtures.stderr('exec-after-stop').replaceAll('<sandbox>', 'plain-1'));
		expect(restarted.stderr).toBe('  ✓ sandbox plain-1 — started\n');
	});
});

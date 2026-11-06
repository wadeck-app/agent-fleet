import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import type {
	NetworkPolicySummary,
	SbxDiagnoseCheck,
	SbxDiagnoseReport,
	SbxIntrospection,
	SbxVersionInfo,
	SettingValue,
} from './SbxIntrospection';
import { SbxOutputParser } from './SbxOutputParser';
import { type PrerequisiteFinding, type PrerequisiteReport, SbxPrerequisiteCheck } from './SbxPrerequisiteCheck';
import { MOCK_SBX_PATH, MockSbxHarness } from './testing/MockSbxHarness';
import { SbxFixtures } from './testing/SbxFixtures';

// Two kinds of test. The ones that read the real texts a failing sbx prints (garbage output, missing executable,
// wrong version, daemon down) go through the sbx mock, where every call is a child process. The ones that check what
// the check makes of a given state (network mode, ssh forwarding, diagnose statuses) feed it that state directly.

// The mock tests are independent (each harness has its own state directory), so they run concurrently; the
// `onTestFinished` of the test context disposes what a test created.

/** Runs the check against the mock; `binaryPath` may be built from the harness (a script to run instead of the mock). */
async function checkWithMock(
	onTestFinished: (cleanup: () => void) => void,
	scenario?: string,
	acceptSshAgentForwarding = false,
	binaryPath: string | ((created: MockSbxHarness) => string) = MOCK_SBX_PATH
): Promise<{ report: PrerequisiteReport; harness: MockSbxHarness }> {
	const harness = new MockSbxHarness(scenario);
	onTestFinished(() => harness.dispose());
	const resolved = typeof binaryPath === 'string' ? binaryPath : binaryPath(harness);
	const report = await new SbxPrerequisiteCheck(harness.runtime({ binaryPath: resolved }), {
		acceptSshAgentForwarding,
	}).run();
	return { report, harness };
}

/** A script standing in for sbx, written in a directory owned by the harness. */
function scriptBinary(name: string, source: string): (created: MockSbxHarness) => string {
	return created => {
		const file = path.join(created.makeDirectory(), name);
		fs.writeFileSync(file, source);
		return file;
	};
}

/** The healthy state of the captured sbx 0.49.2 machine, with the parts a test changes. */
class StateIntrospection implements SbxIntrospection {
	readonly reads: string[] = [];
	diagnose: SbxDiagnoseCheck[] = [
		...new SbxOutputParser().parseDiagnose(new SbxFixtures().stdout('diagnose-json')).checks,
	];
	policy: NetworkPolicySummary = { mode: 'restricted', allowedResourceCount: 195, deniedResourceCount: 0 };
	ssh: SettingValue | undefined = true;

	patchCheck(name: string, patch: Partial<SbxDiagnoseCheck>): void {
		this.diagnose = this.diagnose.map(check => (check.name === name ? { ...check, ...patch } : check));
	}

	readVersion(): Promise<SbxVersionInfo> {
		this.reads.push('version');
		return Promise.resolve({ version: '0.49.2', commit: undefined, binaryPath: '/stub/sbx' });
	}

	readDiagnose(): Promise<SbxDiagnoseReport> {
		this.reads.push('diagnose');
		return Promise.resolve({ checks: this.diagnose });
	}

	readNetworkPolicy(): Promise<NetworkPolicySummary> {
		this.reads.push('policy');
		return Promise.resolve(this.policy);
	}

	readSetting(): Promise<SettingValue | undefined> {
		this.reads.push('setting');
		return Promise.resolve(this.ssh);
	}
}

function checkState(state: StateIntrospection, acceptSshAgentForwarding = false): Promise<PrerequisiteReport> {
	return new SbxPrerequisiteCheck(state, { acceptSshAgentForwarding }).run();
}

function finding(report: PrerequisiteReport, id: PrerequisiteFinding['id']): PrerequisiteFinding {
	const found = report.findings.filter(candidate => candidate.id === id);
	if (found.length !== 1 || found[0] === undefined) {
		throw new Error(
			`Expected exactly one "${id}" finding, got ${found.length}. All: ${report.findings.map(f => f.id).join(', ')}`
		);
	}
	return found[0];
}

describe('SbxPrerequisiteCheck against the sbx mock', () => {
	it.concurrent(
		'on a machine with the sbx defaults: passes the checks, warns about the permissive network policy, errors on the default ssh forwarding, and only runs read-only sbx commands',
		async ({ onTestFinished }) => {
			const { report, harness } = await checkWithMock(onTestFinished);

			expect(report.findings.map(f => [f.id, f.severity])).toEqual([
				['version', 'ok'],
				['daemon', 'ok'],
				['signed-in', 'ok'],
				['policy-initialized', 'ok'],
				['network-mode', 'warning'],
				['ssh-agent-forwarding-enabled', 'error'],
			]);
			expect(report.ok).toBe(false);
			const verbs = new Set(harness.calls().map(call => call.argv.slice(0, 2).join(' ')));
			expect([...verbs].sort()).toEqual(['diagnose --json', 'policy ls', 'settings ls', 'version']);
		}
	);

	it.concurrent(
		'passes completely with ssh forwarding off and a deny-all policy, the network mode being info',
		async ({ onTestFinished }) => {
			const { report } = await checkWithMock(onTestFinished, 'ssh-off,network-deny-all');

			expect(report.ok).toBe(true);
			expect(report.findings.map(f => [f.id, f.severity])).toEqual([
				['version', 'ok'],
				['daemon', 'ok'],
				['signed-in', 'ok'],
				['policy-initialized', 'ok'],
				['network-mode', 'info'],
				['ssh-agent-forwarding-off', 'ok'],
			]);
			expect(finding(report, 'network-mode').message).toBe(
				'Machine network policy is deny-all: a sandbox reaches only the hosts opened for it.'
			);
			expect(finding(report, 'version').message).toBe(`sbx 0.49.2 at ${MOCK_SBX_PATH}.`);
		}
	);

	it.concurrent(
		'errors, with the sbx text, when the network policy or the settings cannot be read',
		async ({ onTestFinished }) => {
			const policy = (await checkWithMock(onTestFinished, 'ssh-off,policy-garbage')).report;
			const unreadable = finding(policy, 'network-policy-unreadable');
			expect(unreadable.severity).toBe('error');
			expect(unreadable.message).toContain('Cannot read the machine network policy');
			expect(unreadable.message).toContain(
				'`sbx policy ls --json` did not print valid JSON: "policy: this is not JSON"'
			);
			expect(policy.ok).toBe(false);

			const settings = (await checkWithMock(onTestFinished, 'settings-garbage,network-deny-all')).report;
			const ssh = finding(settings, 'ssh-setting-unreadable');
			expect(ssh.message).toContain('Cannot read the sbx setting ssh.agentForwardingEnabled');
			expect(ssh.message).toContain('`sbx settings ls --json` did not print valid JSON');
		}
	);

	it.concurrent(
		'reports a missing executable with where to get it and how to point to it, an executable that is not sbx, and one whose version command fails, and stops',
		async ({ onTestFinished }) => {
			let missing = '';
			const absent = (
				await checkWithMock(onTestFinished, undefined, false, created => {
					missing = path.join(created.makeDirectory(), 'sbx.exe');
					return missing;
				})
			).report;
			expect(absent.ok).toBe(false);
			expect(absent.findings.map(f => f.id)).toEqual(['binary-missing']);
			expect(missing).not.toBe('');
			expect(finding(absent, 'binary-missing').message).toContain(
				`The sbx executable configured through the "binaryPath" option does not exist: "${missing}"`
			);
			expect(finding(absent, 'binary-missing').message).toContain(
				'Fix the path or remove the setting to use the default location'
			);

			const harness = new MockSbxHarness();
			onTestFinished(() => harness.dispose());
			const emptyHome = harness.makeDirectory('empty-home-');
			const env = { PATH: emptyHome, LOCALAPPDATA: emptyHome };
			const searched = await new SbxPrerequisiteCheck(
				harness.runtime({ binaryPath: undefined, env, platform: 'win32' }),
				{ acceptSshAgentForwarding: false }
			).run();
			const searchMessage = finding(searched, 'binary-missing').message;
			expect(searchMessage).toContain('The sbx executable (Docker Sandboxes) was not found. Looked in:');
			expect(searchMessage).toContain(path.win32.join(emptyHome, 'DockerSandboxes', 'bin', 'sbx.exe'));
			expect(searchMessage).toContain(
				'Install sbx 0.49.2 (https://github.com/docker/sbx-releases/releases/tag/v0.49.2)'
			);
			expect(searchMessage).toContain('set the SBX_PATH environment variable');

			const notSbx = (
				await checkWithMock(
					onTestFinished,
					undefined,
					false,
					scriptBinary('not-sbx.mjs', 'console.log("hello");\n')
				)
			).report;
			expect(notSbx.findings.map(f => f.id)).toEqual(['version-unreadable']);
			expect(finding(notSbx, 'version-unreadable').message).toContain(
				'Cannot read the sbx version: Cannot read the sbx version from `sbx version` output: "hello"'
			);

			const failing = (
				await checkWithMock(
					onTestFinished,
					undefined,
					false,
					scriptBinary('failing-sbx.mjs', 'console.error("boom");\nprocess.exit(3);\n')
				)
			).report;
			expect(finding(failing, 'version-unreadable').message).toContain(
				'sbx version failed with exit code 3: boom'
			);
		}
	);

	it.concurrent(
		'reports a version other than the pinned one with the install link and stops there',
		async ({ onTestFinished }) => {
			const { report } = await checkWithMock(onTestFinished, 'version:0.50.0,ssh-off,network-deny-all');

			const mismatch = finding(report, 'version-mismatch');
			expect(mismatch.severity).toBe('error');
			expect(mismatch.message).toBe(
				`sbx 0.50.0 found at ${MOCK_SBX_PATH}, but flow-sandbox is pinned to sbx 0.49.2. ` +
					'Install v0.49.2 (https://github.com/docker/sbx-releases/releases/tag/v0.49.2) or point SBX_PATH / the "binaryPath" option to it.'
			);
			expect(report.ok).toBe(false);
			// Every other command refuses to run on a wrong version: reporting them would only repeat this error.
			expect(report.findings.map(f => f.id)).toEqual(['version-mismatch']);
		}
	);

	it.concurrent(
		'reports an unreachable daemon when sbx diagnose fails, and an unreadable diagnose output',
		async ({ onTestFinished }) => {
			const down = (await checkWithMock(onTestFinished, 'daemon-down')).report;

			expect(down.ok).toBe(false);
			const daemon = finding(down, 'daemon-unreachable');
			expect(daemon.message).toContain('`sbx diagnose` failed, so the sandbox daemon is probably not running');
			expect(daemon.message).toContain('cannot connect to the sandbox daemon');
			expect(daemon.message).toContain('Start it with "sbx daemon start" (or "sbx daemon restart")');
			expect(down.findings.map(f => f.id)).toContain('ssh-setting-unreadable');

			const garbage = (await checkWithMock(onTestFinished, 'diagnose-garbage')).report;
			const unreadable = finding(garbage, 'diagnose-unreadable');
			expect(unreadable.message).toContain('Cannot read `sbx diagnose --json`');
			expect(unreadable.message).toContain('did not print valid JSON: "diagnose: this is not JSON"');
		}
	);
});

describe('SbxPrerequisiteCheck on a given state', () => {
	it('reports the network mode: a warning with the number of allowed hosts for an allow-list, a warning for allow-all, info for deny-all', async () => {
		const state = new StateIntrospection();
		state.ssh = false;

		const restricted = finding(await checkState(state), 'network-mode');
		expect(restricted.severity).toBe('warning');
		expect(restricted.message).toContain('Machine network policy is not deny-all: it allows 195 host entries');
		expect(restricted.message).toContain('github.com and package registries');
		expect(restricted.message).toContain('a deny-all for one sandbox is impossible while a global allow exists');
		expect(restricted.message).toContain('flow-sandbox does not change it');

		state.policy = { mode: 'allow-all', allowedResourceCount: 1, deniedResourceCount: 0 };
		const allowAll = await checkState(state);
		expect(finding(allowAll, 'network-mode').severity).toBe('warning');
		expect(finding(allowAll, 'network-mode').message).toContain('it allows EVERY host');
		expect(allowAll.ok).toBe(true);

		state.policy = { mode: 'deny-all', allowedResourceCount: 0, deniedResourceCount: 0 };
		expect(finding(await checkState(state), 'network-mode').severity).toBe('info');
	});

	it('reports the ssh agent forwarding: an error by default saying how to turn it off or accept it, a warning when accepted, ok when off even if accepted', async () => {
		const state = new StateIntrospection();
		state.policy = { mode: 'deny-all', allowedResourceCount: 0, deniedResourceCount: 0 };

		const enabled = finding(await checkState(state), 'ssh-agent-forwarding-enabled');
		expect(enabled.severity).toBe('error');
		expect(enabled.message).toContain('ssh.agentForwardingEnabled is on (the sbx default)');
		expect(enabled.message).toContain('can list and use the keys of your SSH agent');
		expect(enabled.message).toContain('sbx settings set ssh.agentForwardingEnabled false');
		expect(enabled.message).toContain('sbx daemon restart');
		expect(enabled.message).toContain('acceptSshAgentForwarding: true');
		expect(enabled.message).toContain('flow-sandbox does not change the setting');

		const acceptedReport = await checkState(state, true);
		const accepted = finding(acceptedReport, 'ssh-agent-forwarding-accepted');
		expect(accepted.severity).toBe('warning');
		expect(accepted.message).toContain('accepted by the "acceptSshAgentForwarding" option');
		expect(acceptedReport.ok).toBe(true);

		state.ssh = false;
		expect(finding(await checkState(state, true), 'ssh-agent-forwarding-off').message).toBe(
			'ssh.agentForwardingEnabled is off: sandboxes cannot use your SSH keys.'
		);

		state.ssh = undefined;
		const missing = finding(await checkState(state), 'ssh-setting-missing');
		expect(missing.severity).toBe('error');
		expect(missing.message).toContain('sbx has no setting "ssh.agentForwardingEnabled" (sbx 0.49.2 has it)');
		expect(missing.message).toContain('refresh the fixtures');

		state.ssh = 'yes';
		expect(finding(await checkState(state), 'ssh-setting-unreadable').message).toBe(
			'The sbx setting ssh.agentForwardingEnabled is "yes", expected true or false.'
		);
	});

	it('reports a failing diagnose check with the fix, and skips the network policy read when the daemon or the policy is the problem', async () => {
		const unhealthy = new StateIntrospection();
		unhealthy.ssh = false;
		unhealthy.patchCheck('Daemon', { status: 'fail', message: 'not responding', hint: 'Run: sbx daemon restart' });
		const daemonReport = await checkState(unhealthy);
		const daemon = finding(daemonReport, 'daemon-unreachable');
		expect(daemon.message).toContain(
			'The sandbox daemon is not healthy (sbx diagnose: fail, not responding - Run: sbx daemon restart).'
		);
		expect(daemon.message).toContain('"sbx daemon status" shows its state');
		expect(daemonReport.findings.some(f => f.id === 'network-mode')).toBe(false);
		expect(unhealthy.reads).not.toContain('policy');

		const signedOut = new StateIntrospection();
		signedOut.ssh = false;
		signedOut.patchCheck('Authentication', {
			status: 'fail',
			message: 'not authenticated',
			hint: 'Run: sbx login',
		});
		const signedOutReport = await checkState(signedOut);
		const login = finding(signedOutReport, 'not-signed-in');
		expect(login.severity).toBe('error');
		expect(login.message).toContain(
			'sbx is not signed in to Docker (sbx diagnose: fail, not authenticated - Run: sbx login).'
		);
		expect(login.message).toContain('Run "sbx login" and follow the prompts');
		expect(login.message).toContain('--password-stdin');
		expect(signedOutReport.ok).toBe(false);

		const uninitialized = new StateIntrospection();
		uninitialized.ssh = false;
		uninitialized.patchCheck('Global network policy', {
			status: 'fail',
			message: 'not initialized',
			hint: 'Run: sbx policy init <allow-all|balanced|deny-all>',
		});
		const policyReport = await checkState(uninitialized);
		const policy = finding(policyReport, 'policy-not-initialized');
		expect(policy.severity).toBe('error');
		expect(policy.message).toContain(
			'The machine-wide network policy is not initialized (sbx diagnose: fail, not initialized'
		);
		expect(policy.message).toContain('sbx policy init <allow-all|balanced|deny-all>');
		expect(policy.message).toContain('flow-sandbox never does this for you');
		expect(policyReport.findings.some(f => f.id === 'network-mode')).toBe(false);
		expect(uninitialized.reads).not.toContain('policy');
	});

	it('reports a diagnose without an expected check, naming what it did report', async () => {
		const state = new StateIntrospection();
		state.ssh = false;
		state.diagnose = state.diagnose.filter(check => check.name !== 'Authentication');
		state.policy = { mode: 'deny-all', allowedResourceCount: 0, deniedResourceCount: 0 };

		const missing = finding(await checkState(state), 'diagnose-check-missing');

		expect(missing.severity).toBe('error');
		expect(missing.message).toContain(
			'`sbx diagnose --json` no longer reports a "Authentication" check (found: CLI binary, Binary version'
		);
		expect(missing.message).toContain('refresh the fixtures');
	});
});

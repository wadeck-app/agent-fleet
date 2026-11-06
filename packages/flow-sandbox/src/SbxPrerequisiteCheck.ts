import { PINNED_SBX_VERSION, sbxReleaseUrl } from './PinnedSbxVersion';
import { SandboxError } from './SandboxError';
import type { SbxDiagnoseCheck, SbxIntrospection, SettingValue } from './SbxIntrospection';

export type PrerequisiteSeverity = 'ok' | 'info' | 'warning' | 'error';

export type PrerequisiteFindingId =
	| 'binary-missing'
	| 'version-unreadable'
	| 'version-mismatch'
	| 'version'
	| 'daemon-unreachable'
	| 'daemon'
	| 'diagnose-unreadable'
	| 'diagnose-check-missing'
	| 'not-signed-in'
	| 'signed-in'
	| 'policy-not-initialized'
	| 'policy-initialized'
	| 'network-policy-unreadable'
	| 'network-mode'
	| 'ssh-setting-missing'
	| 'ssh-setting-unreadable'
	| 'ssh-agent-forwarding-enabled'
	| 'ssh-agent-forwarding-accepted'
	| 'ssh-agent-forwarding-off';

export interface PrerequisiteFinding {
	id: PrerequisiteFindingId;
	severity: PrerequisiteSeverity;
	/** What was found and, for warnings and errors, what to do about it. */
	message: string;
}

export interface PrerequisiteReport {
	/** False when at least one finding is an error. Warnings do not fail the check. */
	ok: boolean;
	findings: PrerequisiteFinding[];
}

export interface SbxPrerequisiteOptions {
	/** The operator knowingly runs with ssh agent forwarding on (option `acceptSshAgentForwarding`). */
	acceptSshAgentForwarding: boolean;
}

const SSH_SETTING = 'ssh.agentForwardingEnabled';

/**
 * Checks that this machine can run sandboxes, and REPORTS (never changes) the settings that decide how
 * isolated they are. Every error message says what to run to fix it; the code never runs those commands.
 *
 * Which `sbx diagnose` check feeds which finding is taken from sbx 0.49.2. The statuses it prints for a
 * FAILING check were not captured (see README), so any status other than `pass` is reported as an error.
 */
export class SbxPrerequisiteCheck {
	constructor(
		private readonly sbx: SbxIntrospection,
		private readonly options: SbxPrerequisiteOptions
	) {}

	async run(): Promise<PrerequisiteReport> {
		const findings: PrerequisiteFinding[] = [];

		if (!(await this.checkVersion(findings))) return this.report(findings);
		await this.checkDiagnose(findings);
		if (!findings.some(finding => finding.id === 'policy-not-initialized' || finding.id === 'daemon-unreachable')) {
			await this.reportNetworkMode(findings);
		}
		await this.reportSshAgentForwarding(findings);
		return this.report(findings);
	}

	/** Returns false when nothing else can be checked. */
	private async checkVersion(findings: PrerequisiteFinding[]): Promise<boolean> {
		try {
			const info = await this.sbx.readVersion();
			if (info.version !== PINNED_SBX_VERSION) {
				findings.push({
					id: 'version-mismatch',
					severity: 'error',
					message:
						`sbx ${info.version} found at ${info.binaryPath}, but flow-sandbox is pinned to sbx ${PINNED_SBX_VERSION}. ` +
						`Install v${PINNED_SBX_VERSION} (${sbxReleaseUrl(PINNED_SBX_VERSION)}) or point SBX_PATH / the "binaryPath" option to it.`,
				});
				// Every other command refuses to run on a wrong version, so checking further would only repeat this error.
				return false;
			}
			findings.push({ id: 'version', severity: 'ok', message: `sbx ${info.version} at ${info.binaryPath}.` });
			return true;
		} catch (error) {
			if (!(error instanceof SandboxError)) throw error;
			if (error.kind === 'binary-missing') {
				findings.push({ id: 'binary-missing', severity: 'error', message: error.message });
			} else {
				findings.push({
					id: 'version-unreadable',
					severity: 'error',
					message: `Cannot read the sbx version: ${error.message}`,
				});
			}
			return false;
		}
	}

	private async checkDiagnose(findings: PrerequisiteFinding[]): Promise<void> {
		let checks: readonly SbxDiagnoseCheck[];
		try {
			checks = (await this.sbx.readDiagnose()).checks;
		} catch (error) {
			if (!(error instanceof SandboxError)) throw error;
			if (error.kind === 'command-failed') {
				findings.push({
					id: 'daemon-unreachable',
					severity: 'error',
					message:
						`\`sbx diagnose\` failed, so the sandbox daemon is probably not running: ${error.message} ` +
						'Start it with "sbx daemon start" (or "sbx daemon restart"), then run the check again; "sbx daemon status" shows its state.',
				});
			} else {
				findings.push({
					id: 'diagnose-unreadable',
					severity: 'error',
					message: `Cannot read \`sbx diagnose --json\`: ${error.message}`,
				});
			}
			return;
		}

		this.fromDiagnose(findings, checks, 'Daemon', {
			pass: { id: 'daemon', text: 'The sandbox daemon is healthy.' },
			fail: {
				id: 'daemon-unreachable',
				fix: 'Start it with "sbx daemon start" (or "sbx daemon restart"), then run the check again; "sbx daemon status" shows its state.',
				title: 'The sandbox daemon is not healthy',
			},
		});
		this.fromDiagnose(findings, checks, 'Authentication', {
			pass: { id: 'signed-in', text: 'Signed in to Docker.' },
			fail: {
				id: 'not-signed-in',
				fix: 'Run "sbx login" and follow the prompts (non-interactive: pipe a Docker access token to `sbx login --username <name> --password-stdin`), then run the check again.',
				title: 'sbx is not signed in to Docker',
			},
		});
		this.fromDiagnose(findings, checks, 'Global network policy', {
			pass: { id: 'policy-initialized', text: 'The machine-wide network policy is initialized.' },
			fail: {
				id: 'policy-not-initialized',
				fix:
					'Initialize it once with "sbx policy init <allow-all|balanced|deny-all>". flow-sandbox never does this for you because the choice sets what every sandbox can reach: ' +
					'"deny-all" is the strictest, "balanced" allows common registries and github.com.',
				title: 'The machine-wide network policy is not initialized',
			},
		});
	}

	private fromDiagnose(
		findings: PrerequisiteFinding[],
		checks: readonly SbxDiagnoseCheck[],
		name: string,
		outcome: {
			pass: { id: PrerequisiteFindingId; text: string };
			fail: { id: PrerequisiteFindingId; fix: string; title: string };
		}
	): void {
		const check = checks.find(candidate => candidate.name === name);
		if (check === undefined) {
			findings.push({
				id: 'diagnose-check-missing',
				severity: 'error',
				message:
					`\`sbx diagnose --json\` no longer reports a "${name}" check (found: ${checks.map(c => c.name).join(', ') || 'none'}). ` +
					`The sbx output format differs from ${PINNED_SBX_VERSION}: run the gated live check and refresh the fixtures before relying on this machine.`,
			});
			return;
		}
		if (check.status === 'pass') {
			findings.push({ id: outcome.pass.id, severity: 'ok', message: outcome.pass.text });
			return;
		}
		const reported = [check.message, check.hint].filter(part => part !== '').join(' - ');
		findings.push({
			id: outcome.fail.id,
			severity: 'error',
			message: `${outcome.fail.title} (sbx diagnose: ${check.status}${reported === '' ? '' : `, ${reported}`}). ${outcome.fail.fix}`,
		});
	}

	private async reportNetworkMode(findings: PrerequisiteFinding[]): Promise<void> {
		try {
			const policy = await this.sbx.readNetworkPolicy();
			if (policy.mode === 'deny-all') {
				findings.push({
					id: 'network-mode',
					severity: 'info',
					message: 'Machine network policy is deny-all: a sandbox reaches only the hosts opened for it.',
				});
				return;
			}
			const detail =
				policy.mode === 'allow-all'
					? 'it allows EVERY host'
					: `it allows ${policy.allowedResourceCount} host entries (the "balanced" preset or a custom list, for example github.com and package registries)`;
			findings.push({
				id: 'network-mode',
				severity: 'warning',
				message:
					`Machine network policy is not deny-all: ${detail}. Per-sandbox rules can only add access; a deny-all for one sandbox is impossible while a global allow exists. ` +
					'Tightening it is your decision and affects every sandbox on the machine (see "sbx policy --help": init, reset, rm); flow-sandbox does not change it.',
			});
		} catch (error) {
			if (!(error instanceof SandboxError)) throw error;
			findings.push({
				id: 'network-policy-unreadable',
				severity: 'error',
				message: `Cannot read the machine network policy: ${error.message}`,
			});
		}
	}

	private async reportSshAgentForwarding(findings: PrerequisiteFinding[]): Promise<void> {
		let value: SettingValue | undefined;
		try {
			value = await this.sbx.readSetting(SSH_SETTING);
		} catch (error) {
			if (!(error instanceof SandboxError)) throw error;
			findings.push({
				id: 'ssh-setting-unreadable',
				severity: 'error',
				message: `Cannot read the sbx setting ${SSH_SETTING}: ${error.message}`,
			});
			return;
		}
		if (value === undefined) {
			findings.push({
				id: 'ssh-setting-missing',
				severity: 'error',
				message:
					`sbx has no setting "${SSH_SETTING}" (sbx ${PINNED_SBX_VERSION} has it), so SSH agent forwarding cannot be verified. ` +
					'Run the gated live check and refresh the fixtures before relying on this machine.',
			});
			return;
		}
		if (typeof value !== 'boolean') {
			findings.push({
				id: 'ssh-setting-unreadable',
				severity: 'error',
				message: `The sbx setting ${SSH_SETTING} is ${JSON.stringify(value)}, expected true or false.`,
			});
			return;
		}
		if (!value) {
			findings.push({
				id: 'ssh-agent-forwarding-off',
				severity: 'ok',
				message: `${SSH_SETTING} is off: sandboxes cannot use your SSH keys.`,
			});
			return;
		}
		if (this.options.acceptSshAgentForwarding) {
			findings.push({
				id: 'ssh-agent-forwarding-accepted',
				severity: 'warning',
				message: `${SSH_SETTING} is on and accepted by the "acceptSshAgentForwarding" option: code in a sandbox can use your SSH agent keys to sign requests.`,
			});
			return;
		}
		findings.push({
			id: 'ssh-agent-forwarding-enabled',
			severity: 'error',
			message:
				`${SSH_SETTING} is on (the sbx default): code running in a sandbox can list and use the keys of your SSH agent. ` +
				`Turn it off with "sbx settings set ${SSH_SETTING} false" and "sbx daemon restart", ` +
				'or accept the risk explicitly with the option acceptSshAgentForwarding: true. flow-sandbox does not change the setting.',
		});
	}

	private report(findings: PrerequisiteFinding[]): PrerequisiteReport {
		return { ok: !findings.some(finding => finding.severity === 'error'), findings };
	}
}

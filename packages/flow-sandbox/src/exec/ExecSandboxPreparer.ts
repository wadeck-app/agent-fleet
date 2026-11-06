import { CredentialGlueInstaller } from '../CredentialGlueInstaller';
import { describeError } from '../ErrorText';
import type { HostCredentialEndpoint } from '../HostCredentialEndpoint';
import type { RunMounts } from '../RunMounts';
import { SandboxCredentialAccess } from '../SandboxCredentialAccess';
import type { SandboxLog } from '../SandboxLog';
import { SandboxNetworkRules } from '../SandboxNetworkRules';
import type { SandboxRuntime } from '../SandboxRuntime';
import { ToolStoreRedirect } from '../ToolStoreRedirect';

export type ExecStepType = 'model' | 'script';

export interface ExecSandboxPreparerOptions {
	runtime: SandboxRuntime;
	endpoint: HostCredentialEndpoint;
	log: SandboxLog;
	platform: NodeJS.Platform;
	/** Host directory for the private secret files; outside every mount. */
	secretsDirectory: string;
	/** The profile alias the model steps use (the host profile behind it is the endpoint's `profiles`). */
	profileAlias: string;
	region: string;
	extraAllowedHosts?: readonly string[];
	/** Further environment for model steps, for example `ANTHROPIC_DEFAULT_SONNET_MODEL`. */
	modelEnvironment?: Readonly<Record<string, string>>;
}

export interface ExecPreparedSandbox {
	/** Environment merged into the `env` of each step of this type (the wrapper's values win). */
	envFor(stepType: ExecStepType): Readonly<Record<string, string>>;
	/** Undoes `prepare` on a sandbox that still exists; not needed when the sandbox is removed. */
	detach(): Promise<void>;
}

/**
 * The exec variant of "sandbox ready for a run": the M2 credential access (sandbox-scoped network rules, credential
 * secret, VM-side `credential_process` glue) and the tool store under `<meta>/sessions/claude`. There is no bridge and no
 * bridge token. The VM proxy variables are NOT copied into the model environment: `sbx exec` keeps the sandbox's own
 * environment, which already carries them (the relay variant needed VmProxyEnvironment only because the flow worker
 * isolates the environment of the model CLI it starts).
 *
 * Model steps get the Bedrock environment (profile alias, region, `CLAUDE_CODE_USE_BEDROCK`, config file, store);
 * script steps get nothing: no credential reaches a script's environment.
 */
export class ExecSandboxPreparer {
	constructor(private readonly options: ExecSandboxPreparerOptions) {}

	async prepare(sandbox: string, mounts: RunMounts): Promise<ExecPreparedSandbox> {
		const { options } = this;
		const access = await new SandboxCredentialAccess({
			runtime: options.runtime,
			endpoint: options.endpoint,
			networkRules: new SandboxNetworkRules(options.runtime, options.log),
			glue: new CredentialGlueInstaller(options.runtime),
			translator: mounts.translator,
			tempDirectory: options.secretsDirectory,
			log: options.log,
		}).attach({
			sandbox,
			aliases: [options.profileAlias],
			region: options.region,
			tools: ['claude'],
			...(options.extraAllowedHosts === undefined ? {} : { extraAllowedHosts: options.extraAllowedHosts }),
		});

		let store: ReturnType<ToolStoreRedirect['prepare']>;
		try {
			const [, meta] = mounts.sandboxMounts();
			if (meta === undefined) throw new Error('RunMounts must have two mounts');
			store = new ToolStoreRedirect({
				translator: mounts.translator,
				workspaceMetaDir: meta.hostPath,
				platform: options.platform,
				codexDisablePlugins: true,
			}).prepare('claude');
		} catch (error) {
			// The credential access was attached above: undo it so a retry does not meet "already has a credential grant".
			await access.detach().catch(detachError => {
				options.log.warn(
					`Could not undo the credential access of "${sandbox}" after a failure: ${describeError(detachError)}`
				);
			});
			throw error;
		}

		const modelEnvironment: Record<string, string> = {
			...access.env,
			AWS_PROFILE: options.profileAlias,
			CLAUDE_CODE_USE_BEDROCK: '1',
			...store.env,
			...(options.modelEnvironment ?? {}),
		};
		options.log.info(
			`sandbox "${sandbox}" prepared (exec variant): model env keys ${Object.keys(modelEnvironment).sort().join(',')}; session store ${store.sandboxDirectory}`
		);
		return {
			envFor: stepType => (stepType === 'model' ? modelEnvironment : {}),
			detach: () => access.detach(),
		};
	}
}

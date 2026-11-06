import { randomBytes } from 'node:crypto';

import { CredentialGlueInstaller } from '../CredentialGlueInstaller';
import { describeError } from '../ErrorText';
import type { HostCredentialEndpoint } from '../HostCredentialEndpoint';
import { PrivateSecretFile } from '../PrivateSecretFile';
import type { RunMounts } from '../RunMounts';
import { SandboxCredentialAccess } from '../SandboxCredentialAccess';
import type { SandboxLog } from '../SandboxLog';
import { SandboxNetworkRules } from '../SandboxNetworkRules';
import type { SandboxRuntime } from '../SandboxRuntime';
import { ToolStoreRedirect } from '../ToolStoreRedirect';
import type { BridgeTokenGuard } from './BridgeTokenGuard';
import type { SandboxStepType } from './HarnessMessages';
import type { PreparedSandbox, SandboxPreparer } from './SandboxPreparer';
import { VmProxyEnvironment } from './VmProxyEnvironment';

export const BRIDGE_TOKEN_VARIABLE = 'FLOW_BRIDGE_TOKEN';

export interface CredentialedSandboxPreparerOptions {
	runtime: SandboxRuntime;
	endpoint: HostCredentialEndpoint;
	tokens: BridgeTokenGuard;
	log: SandboxLog;
	platform: NodeJS.Platform;
	/** Host directory for the private secret files; outside every mount. */
	secretsDirectory: string;
	/** The profile alias the model steps use (the host profile behind it is the endpoint's `profiles`). */
	profileAlias: string;
	region: string;
	/** Extra `host:port` rules for this sandbox. */
	extraAllowedHosts?: readonly string[];
	/** Further environment for model steps, for example `ANTHROPIC_DEFAULT_SONNET_MODEL`. */
	modelEnvironment?: Readonly<Record<string, string>>;
}

/**
 * The relay variant of "sandbox ready for a run" (M2 + G1):
 * 1. credentials: sandbox-scoped network rules (credential endpoint, bridge port, Bedrock host), the credential
 *    secret and the VM-side `credential_process` glue (SandboxCredentialAccess);
 * 2. bridge token: a random secret expected by the bridge, stored as a sbx custom secret for host `localhost` and
 *    given to the inner worker exec only as a placeholder (the sbx proxy swaps it in the upgrade header);
 * 3. proxy variables: a model step runs with an isolated environment, so the VM's proxy settings are copied into it
 *    (VmProxyEnvironment); without them the credential placeholder would not be substituted;
 * 4. tool store: `CLAUDE_CONFIG_DIR` under `<meta>/sessions/claude`, so the session lands on the host mount.
 * Model steps get the Bedrock environment (profile alias, region, `CLAUDE_CODE_USE_BEDROCK`, config file, store);
 * script steps get nothing: no credential reaches a script's environment.
 */
export class CredentialedSandboxPreparer implements SandboxPreparer {
	constructor(private readonly options: CredentialedSandboxPreparerOptions) {}

	async prepare(sandbox: string, mounts: RunMounts, bridgePort: number): Promise<PreparedSandbox> {
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
			bridgePort,
			...(options.extraAllowedHosts === undefined ? {} : { extraAllowedHosts: options.extraAllowedHosts }),
		});

		const token = randomBytes(24).toString('hex');
		const placeholder = `flow-ph-${randomBytes(16).toString('hex')}`;
		let secretFile: PrivateSecretFile | undefined;
		try {
			options.tokens.expect(token);
			secretFile = PrivateSecretFile.create(options.secretsDirectory, token);
			await options.runtime.setSecret({
				sandbox,
				hosts: ['localhost'],
				envVar: BRIDGE_TOKEN_VARIABLE,
				placeholder,
				valueCommand: secretFile.valueCommand(),
			});
		} catch (error) {
			options.tokens.revoke();
			secretFile?.dispose();
			await access.detach().catch((detachError: unknown) => {
				options.log.warn(
					`Could not undo the credential access of "${sandbox}" after a failure: ${describeError(detachError)}`
				);
			});
			throw error;
		}

		let proxyEnvironment: Record<string, string>;
		let store: ReturnType<ToolStoreRedirect['prepare']>;
		try {
			const vmEnvironment = await options.runtime.exec({ sandbox, command: ['env'] });
			proxyEnvironment = VmProxyEnvironment.parse(sandbox, vmEnvironment.stdout);
			const [, meta] = mounts.sandboxMounts();
			if (meta === undefined) throw new Error('RunMounts must have two mounts');
			store = new ToolStoreRedirect({
				translator: mounts.translator,
				workspaceMetaDir: meta.hostPath,
				platform: options.platform,
				codexDisablePlugins: true,
			}).prepare('claude');
		} catch (error) {
			// Everything attached above is undone; a failing undo step is logged, the original error is rethrown.
			options.tokens.revoke();
			secretFile?.dispose();
			await options.runtime.removeSecret({ sandbox, placeholder }).catch(removeError => {
				options.log.warn(
					`Could not remove the bridge secret of "${sandbox}" after a failure: ${describeError(removeError)}`
				);
			});
			await access.detach().catch(detachError => {
				options.log.warn(
					`Could not undo the credential access of "${sandbox}" after a failure: ${describeError(detachError)}`
				);
			});
			throw error;
		}

		const modelEnvironment: Record<string, string> = {
			...proxyEnvironment,
			...access.env,
			AWS_PROFILE: options.profileAlias,
			CLAUDE_CODE_USE_BEDROCK: '1',
			...store.env,
			...(options.modelEnvironment ?? {}),
		};
		options.log.info(
			`sandbox "${sandbox}" prepared: model env keys ${Object.keys(modelEnvironment).sort().join(',')}; session store ${store.sandboxDirectory}`
		);
		return {
			envFor: (stepType: SandboxStepType) => (stepType === 'model' ? modelEnvironment : {}),
			innerEnv: {
				FLOW_BRIDGE_URL: `ws://host.docker.internal:${bridgePort}/`,
				[BRIDGE_TOKEN_VARIABLE]: placeholder,
			},
			detach: async () => {
				options.tokens.revoke();
				secretFile?.dispose();
				try {
					await options.runtime.removeSecret({ sandbox, placeholder });
				} finally {
					await access.detach();
				}
			},
		};
	}
}

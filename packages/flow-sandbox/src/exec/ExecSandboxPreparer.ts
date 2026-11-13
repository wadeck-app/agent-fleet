import * as fs from 'node:fs';
import * as path from 'node:path';

import { CodexBedrockSettings } from '../CodexBedrockSettings';
import { CredentialGlueInstaller } from '../CredentialGlueInstaller';
import { describeError } from '../ErrorText';
import type { HostCredentialEndpoint } from '../HostCredentialEndpoint';
import type { ModelTool } from '../ModelTool';
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
	/** Further environment for CLAUDE model steps, for example `ANTHROPIC_DEFAULT_SONNET_MODEL`. */
	modelEnvironment?: Readonly<Record<string, string>>;
}

export interface ExecPreparedSandbox {
	/**
	 * Makes the sandbox ready for a model tool it was not prepared for (network rules for its hosts, its session store, its
	 * configuration). Idempotent. Call it before {@link envFor} for a tool.
	 */
	ensureTool(tool: ModelTool): Promise<void>;
	/** Environment merged into the `env` of each step of this type and tool (the wrapper's values win). */
	envFor(stepType: ExecStepType, tool: ModelTool | undefined): Readonly<Record<string, string>>;
	/** Undoes `prepare` on a sandbox that still exists; not needed when the sandbox is removed. */
	detach(): Promise<void>;
}

/**
 * The exec variant of "sandbox ready for a run": the M2 credential access (sandbox-scoped network rules, credential
 * secret, VM-side `credential_process` glue) and, per model tool, the session store under `<meta>/sessions/<tool>`. There is
 * no bridge and no bridge token. The VM proxy variables are NOT copied into the model environment: `sbx exec` keeps the
 * sandbox's own environment, which already carries them (the relay variant needed VmProxyEnvironment only because the flow
 * worker isolates the environment of the model CLI it starts).
 *
 * Per tool (a step's `provider`): claude gets the Bedrock environment (profile alias, region, `CLAUDE_CODE_USE_BEDROCK`, config
 * file, store); codex gets `CODEX_HOME` on the mount with a `config.toml` that selects the Bedrock provider (the engine passes
 * the model with `-m`); opencode gets the AWS profile and region and `XDG_DATA_HOME` on the mount. A tool's hosts are opened
 * only when a step of that tool is first served. Script steps get nothing: no credential reaches a script's environment.
 */
export class ExecSandboxPreparer {
	constructor(private readonly options: ExecSandboxPreparerOptions) {}

	async prepare(sandbox: string, mounts: RunMounts, firstTool: ModelTool = 'claude'): Promise<ExecPreparedSandbox> {
		const { options } = this;
		const rules = new SandboxNetworkRules(options.runtime, options.log);
		const access = await new SandboxCredentialAccess({
			runtime: options.runtime,
			endpoint: options.endpoint,
			networkRules: rules,
			glue: new CredentialGlueInstaller(options.runtime),
			translator: mounts.translator,
			tempDirectory: options.secretsDirectory,
			log: options.log,
		}).attach({
			sandbox,
			aliases: [options.profileAlias],
			region: options.region,
			tools: [firstTool],
			...(options.extraAllowedHosts === undefined ? {} : { extraAllowedHosts: options.extraAllowedHosts }),
		});

		let stores: ToolStoreRedirect;
		const environments = new Map<ModelTool, Readonly<Record<string, string>>>();
		const openHosts = new Set(rules.resourcesFor(this.rulesRequest(sandbox, firstTool)));
		const prepareTool = (tool: ModelTool): Readonly<Record<string, string>> => {
			const store = stores.prepare(tool);
			switch (tool) {
				case 'claude':
					return {
						...access.env,
						AWS_PROFILE: options.profileAlias,
						CLAUDE_CODE_USE_BEDROCK: '1',
						...store.env,
						...(options.modelEnvironment ?? {}),
					};
				case 'codex':
					fs.writeFileSync(
						path.join(store.hostDirectory, 'config.toml'),
						CodexBedrockSettings.configToml({
							profileAlias: options.profileAlias,
							region: options.region,
							disablePlugins: true,
						}),
						'utf8'
					);
					return { ...access.env, ...store.env };
				case 'opencode':
					return { ...access.env, AWS_PROFILE: options.profileAlias, ...store.env };
				default:
					throw new Error(`No environment is defined for model tool "${String(tool)}".`);
			}
		};

		try {
			stores = new ToolStoreRedirect({
				translator: mounts.translator,
				workspaceMetaDir: mounts.metaMount().hostPath,
				platform: options.platform,
				codexDisablePlugins: true,
			});
			environments.set(firstTool, prepareTool(firstTool));
		} catch (error) {
			// The credential access was attached above: undo it so a retry does not meet "already has a credential grant".
			await access.detach().catch(detachError => {
				options.log.warn(
					`Could not undo the credential access of "${sandbox}" after a failure: ${describeError(detachError)}`
				);
			});
			throw error;
		}
		options.log.info(
			`sandbox "${sandbox}" prepared (exec variant) for ${firstTool}: model env keys ${Object.keys(
				environments.get(firstTool) ?? {}
			)
				.sort()
				.join(',')}`
		);

		return {
			ensureTool: async tool => {
				if (environments.has(tool)) return;
				const needed = rules
					.resourcesFor(this.rulesRequest(sandbox, tool))
					.filter(host => !openHosts.has(host));
				if (needed.length > 0) {
					await options.runtime.allowNetwork({ sandbox, resources: needed });
					for (const host of needed) openHosts.add(host);
					options.log.info(
						`network rules added for ${tool}: sandbox=${sandbox} resources=${needed.join(',')}`
					);
				}
				environments.set(tool, prepareTool(tool));
			},
			envFor: (stepType, tool) => {
				if (stepType !== 'model') return {};
				const resolved = tool ?? 'claude';
				const environment = environments.get(resolved);
				if (environment === undefined) {
					throw new Error(
						`The sandbox "${sandbox}" is not prepared for ${resolved}: call ensureTool("${resolved}") before asking for its environment.`
					);
				}
				return environment;
			},
			detach: () => access.detach(),
		};
	}

	private rulesRequest(sandbox: string, tool: ModelTool) {
		return {
			sandbox,
			endpointPort: this.options.endpoint.port,
			region: this.options.region,
			tools: [tool],
			...(this.options.extraAllowedHosts === undefined
				? {}
				: { extraAllowedHosts: this.options.extraAllowedHosts }),
		};
	}
}

import { randomBytes } from 'node:crypto';

import type { CredentialGlueInstaller } from './CredentialGlueInstaller';
import { CREDENTIAL_TOKEN_VARIABLE } from './CredentialProcessScript';
import type { HostCredentialEndpoint } from './HostCredentialEndpoint';
import type { PathTranslator } from './PathTranslator';
import { PrivateSecretFile } from './PrivateSecretFile';
import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import type { SandboxNetworkRules, SandboxNetworkRulesRequest } from './SandboxNetworkRules';
import type { SandboxRuntime } from './SandboxRuntime';

export interface SandboxCredentialAccessOptions {
	runtime: SandboxRuntime;
	endpoint: HostCredentialEndpoint;
	networkRules: SandboxNetworkRules;
	glue: CredentialGlueInstaller;
	/** Used to refuse a temporary directory that lies inside a sandbox mount. */
	translator: PathTranslator;
	/** Host directory for the private secret files. Must not be inside a mount. */
	tempDirectory: string;
	log: SandboxLog;
	/** Placeholder generator. Default: `flow-ph-` plus 16 random bytes in hex. Injected for tests only. */
	generatePlaceholder?: () => string;
}

export interface CredentialAccessRequest {
	sandbox: string;
	/** Profile aliases this sandbox may request (keys of the endpoint's `profiles`). */
	aliases: readonly string[];
	region: string;
	tools: readonly string[];
	bridgePort?: number;
	codexNeedsGithub?: boolean;
	extraAllowedHosts?: readonly string[];
}

export interface CredentialAccess {
	/** Environment for every tool process of the sandbox: the placeholder, `AWS_CONFIG_FILE` and `AWS_REGION`. Add `AWS_PROFILE=<alias>`. */
	env: Readonly<Record<string, string>>;
	/** Undoes `attach` on a sandbox that still exists. Not needed when the sandbox is removed (sbx drops its rules and secrets). */
	detach(): Promise<void>;
}

/**
 * Wires one sandbox to the host credential endpoint, in this order:
 * grant (bearer secret + aliases) -> private secret file -> network rules -> sbx custom secret
 * (`localhost`, placeholder -> secret read from the file by `cat`) -> VM-side script and AWS config.
 * The VM ends up with a placeholder and a credential_process profile; no AWS key, no real secret.
 * A failing step rolls back the earlier ones and rethrows its own error.
 */
export class SandboxCredentialAccess {
	constructor(private readonly options: SandboxCredentialAccessOptions) {}

	async attach(request: CredentialAccessRequest): Promise<CredentialAccess> {
		this.requireTemporaryDirectoryOutsideMounts();
		const { runtime, endpoint, networkRules, glue, log } = this.options;
		const rulesRequest = this.rulesRequest(request, endpoint.port);
		const placeholder = (
			this.options.generatePlaceholder ?? (() => `flow-ph-${randomBytes(16).toString('hex')}`)
		)();

		const undo: (() => Promise<void>)[] = [];
		try {
			const secret = endpoint.registerSandbox(request.sandbox, request.aliases);
			undo.push(() => Promise.resolve(endpoint.unregisterSandbox(request.sandbox)));

			const secretFile = PrivateSecretFile.create(this.options.tempDirectory, secret);
			undo.push(() => Promise.resolve(secretFile.dispose()));

			await networkRules.apply(rulesRequest);
			undo.push(() => networkRules.revoke(rulesRequest));

			await runtime.setSecret({
				sandbox: request.sandbox,
				hosts: ['localhost'],
				envVar: CREDENTIAL_TOKEN_VARIABLE,
				placeholder,
				valueCommand: secretFile.valueCommand(),
			});
			undo.push(() => runtime.removeSecret({ sandbox: request.sandbox, placeholder }));

			const installed = await glue.install({
				sandbox: request.sandbox,
				endpointPort: endpoint.port,
				aliases: request.aliases,
				region: request.region,
			});
			log.info(
				`credential access ready: sandbox=${request.sandbox} aliases=${request.aliases.join(',')} endpointPort=${endpoint.port}`
			);
			let detached = false;
			return {
				env: { ...installed.env, [CREDENTIAL_TOKEN_VARIABLE]: placeholder },
				detach: async () => {
					if (detached) return;
					detached = true;
					await this.detach(request.sandbox, undo);
				},
			};
		} catch (error) {
			await this.rollback(request.sandbox, undo);
			throw error;
		}
	}

	private rulesRequest(request: CredentialAccessRequest, endpointPort: number): SandboxNetworkRulesRequest {
		return {
			sandbox: request.sandbox,
			endpointPort,
			bridgePort: request.bridgePort,
			region: request.region,
			tools: request.tools,
			codexNeedsGithub: request.codexNeedsGithub,
			extraAllowedHosts: request.extraAllowedHosts,
		};
	}

	/** sbx requires command-secret helpers outside the writable mounts of the sandbox. */
	private requireTemporaryDirectoryOutsideMounts(): void {
		let insideMount = true;
		try {
			this.options.translator.toSandbox(this.options.tempDirectory, 'tempDirectory');
		} catch (error) {
			if (!(error instanceof SandboxError) || error.kind !== 'path-outside-mounts') throw error;
			insideMount = false;
		}
		if (insideMount) {
			throw new SandboxError(
				'invalid-options',
				`The temporary directory "${this.options.tempDirectory}" is inside a sandbox mount, so the agent could read or replace the credential secret file. ` +
					'Use a temporary directory outside the run workspace and its .meta directory.'
			);
		}
	}

	private async rollback(sandbox: string, undo: (() => Promise<void>)[]): Promise<void> {
		while (undo.length > 0) {
			const step = undo.pop();
			try {
				await step?.();
			} catch (error) {
				this.options.log.warn(
					`credential access rollback step failed: sandbox=${sandbox} - ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	}

	private async detach(sandbox: string, undo: (() => Promise<void>)[]): Promise<void> {
		const failures: string[] = [];
		while (undo.length > 0) {
			const step = undo.pop();
			try {
				await step?.();
			} catch (error) {
				// The sandbox may already be gone: its rules and secrets went with it.
				if (error instanceof SandboxError && error.kind === 'not-found') continue;
				failures.push(error instanceof Error ? error.message : String(error));
			}
		}
		if (failures.length > 0) {
			throw new SandboxError(
				'command-failed',
				`Removing the credential access of sandbox "${sandbox}" failed in ${failures.length} step(s), the others were done: ${failures.join(' | ')}. ` +
					'Remove the sandbox to drop everything scoped to it.',
				{ sandbox }
			);
		}
		this.options.log.info(`credential access removed: sandbox=${sandbox}`);
	}
}

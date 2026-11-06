import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import type { SandboxRuntime, SbxSecretService } from './SandboxRuntime';

export interface ProviderSecretRequest {
	sandbox: string;
	/** sbx service name, for example `openai` or `anthropic`. */
	provider: string;
	/** `oauth` is refused with the reason; `api-key` is the default. */
	authentication?: 'api-key' | 'oauth';
}

/** Host environment variable that holds the API key of each supported sbx service. */
const KEY_VARIABLE: Readonly<Partial<Record<SbxSecretService, string>>> = {
	anthropic: 'ANTHROPIC_API_KEY',
	openai: 'OPENAI_API_KEY',
	openrouter: 'OPENROUTER_API_KEY',
	groq: 'GROQ_API_KEY',
	mistral: 'MISTRAL_API_KEY',
	xai: 'XAI_API_KEY',
};

/**
 * Gives a sandbox the API key of a model provider through `sbx secret set <service> --sandbox <name>`:
 * the sbx proxy injects the key into requests to that provider, the VM never holds it.
 *
 * The key comes from an environment variable of the wrapper (`hostEnvironment`). It is passed to sbx on
 * standard input, is never logged and never appears on a command line. sbx shows the first and last
 * characters of a stored key in `sbx secret rm`'s listing, which is why the secret stays scoped to the
 * sandbox it was stored for.
 *
 * Codex OAuth is not supported: `sbx secret set openai --oauth` opens a browser on the host and stores the
 * token globally, which would give it to every sandbox.
 */
export class ProviderSecrets {
	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly hostEnvironment: Readonly<Record<string, string | undefined>>,
		private readonly log: SandboxLog
	) {}

	async install(request: ProviderSecretRequest): Promise<void> {
		const service = this.service(request.provider);
		if (request.authentication === 'oauth') {
			throw new SandboxError(
				'invalid-argument',
				`OAuth login for "${service}" is not supported in a sandbox: it needs a browser on the host and sbx stores the token for every sandbox, not for this one. ` +
					`Use an API key instead: set ${KEY_VARIABLE[service]} in the environment of the process that runs the wrapper.`,
				{ sandbox: request.sandbox }
			);
		}
		const variable = KEY_VARIABLE[service] as string;
		const value = this.hostEnvironment[variable];
		if (value === undefined || value.trim() === '') {
			throw new SandboxError(
				'invalid-argument',
				`No API key for "${service}": the environment variable ${variable} is not set (or empty) in the process that runs the wrapper. ` +
					'Set it there, or remove this provider from the step.',
				{ sandbox: request.sandbox }
			);
		}
		await this.runtime.setServiceSecret({ sandbox: request.sandbox, service, value: value.trim() });
		this.log.info(`provider secret stored: sandbox=${request.sandbox} service=${service} source=${variable}`);
	}

	private service(provider: string): SbxSecretService {
		const supported = Object.keys(KEY_VARIABLE) as SbxSecretService[];
		const found = supported.find(candidate => candidate === provider);
		if (found === undefined) {
			throw new SandboxError(
				'invalid-argument',
				`Provider "${provider}" has no API-key support yet. Supported: ${supported.join(', ')}. ` +
					'(Bedrock does not use this path: it goes through the credential endpoint.)'
			);
		}
		return found;
	}
}

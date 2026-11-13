import { requireAwsRegion } from './AwsRegion';
import { requireProfileAlias } from './ProfileAlias';
import { SandboxError } from './SandboxError';

export interface CodexBedrockRequest {
	/** Bedrock model id of the OpenAI-on-Bedrock form, for example `openai.gpt-5.6-terra`. */
	model: string;
	/** Profile ALIAS of the VM-side AWS config (not the host profile name). */
	profileAlias: string;
	region: string;
}

const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export interface CodexProviderConfigRequest {
	profileAlias: string;
	region: string;
	/** `[features] plugins = false`: Codex clones a plugins repository at its first session start otherwise (the `--disable plugins` option). */
	disablePlugins: boolean;
}

/**
 * The `-c` settings that make `codex exec` use Bedrock with the credential_process profile of the VM
 * (validated with codex-cli 0.149.1, see the research findings). They go after `exec`.
 */
export class CodexBedrockSettings {
	/**
	 * The same provider settings as a `config.toml` for CODEX_HOME, without the model (the step's `-m` carries it). Used where the arguments
	 * of codex are the engine's and cannot be extended (the exec variant). The alias and the region are validated like for `arguments`.
	 */
	static configToml(request: CodexProviderConfigRequest): string {
		requireProfileAlias(request.profileAlias);
		requireAwsRegion(request.region);
		return [
			'model_provider = "amazon-bedrock"',
			'',
			'[model_providers.amazon-bedrock.aws]',
			`profile = "${request.profileAlias}"`,
			`region = "${request.region}"`,
			'',
			...(request.disablePlugins ? ['[features]', 'plugins = false', ''] : []),
		].join('\n');
	}

	static arguments(request: CodexBedrockRequest): string[] {
		if (!MODEL.test(request.model)) {
			throw new SandboxError(
				'invalid-argument',
				`Codex model "${request.model}" is not valid. Use the Bedrock id, for example "openai.gpt-5.6-terra".`
			);
		}
		requireProfileAlias(request.profileAlias);
		requireAwsRegion(request.region);
		return [
			'-c',
			'model_provider="amazon-bedrock"',
			'-c',
			`model="${request.model}"`,
			'-c',
			`model_providers.amazon-bedrock.aws.profile="${request.profileAlias}"`,
			'-c',
			`model_providers.amazon-bedrock.aws.region="${request.region}"`,
		];
	}
}

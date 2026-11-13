import { describe, expect, it } from 'vitest';

import { CodexBedrockSettings } from './CodexBedrockSettings';
import { failure } from './testing/ExpectedFailures';

const request = { model: 'openai.gpt-5.6-terra', profileAlias: 'codex', region: 'us-east-1' };

describe('CodexBedrockSettings', () => {
	it('builds the validated -c settings, in order', () => {
		expect(CodexBedrockSettings.arguments(request)).toEqual([
			'-c',
			'model_provider="amazon-bedrock"',
			'-c',
			'model="openai.gpt-5.6-terra"',
			'-c',
			'model_providers.amazon-bedrock.aws.profile="codex"',
			'-c',
			'model_providers.amazon-bedrock.aws.region="us-east-1"',
		]);
	});

	// The exec variant cannot add arguments to the engine's codex command, so the same provider settings go to the config.toml of CODEX_HOME. The model is
	// left out: the engine passes the step's model with -m.
	it('renders the same provider settings as the config.toml of CODEX_HOME, with the plugins feature off on request', () => {
		const text = CodexBedrockSettings.configToml({
			profileAlias: 'codex',
			region: 'us-east-1',
			disablePlugins: true,
		});

		expect(text).toBe(
			[
				'model_provider = "amazon-bedrock"',
				'',
				'[model_providers.amazon-bedrock.aws]',
				'profile = "codex"',
				'region = "us-east-1"',
				'',
				'[features]',
				'plugins = false',
				'',
			].join('\n')
		);
		expect(
			CodexBedrockSettings.configToml({ profileAlias: 'codex', region: 'us-east-1', disablePlugins: false })
		).not.toContain('[features]');
	});

	it('refuses an alias or a region that could inject another setting into the config.toml', () => {
		expect(
			failure(() =>
				CodexBedrockSettings.configToml({ profileAlias: 'a"b', region: 'us-east-1', disablePlugins: true })
			).message
		).toContain('Profile alias');
		expect(
			failure(() => CodexBedrockSettings.configToml({ profileAlias: 'a', region: 'x\ny', disablePlugins: true }))
				.kind
		).toBe('invalid-argument');
	});

	it('refuses a model that could inject another setting, and an invalid alias and region with their own messages', () => {
		for (const model of ['', 'a b', 'x"y', 'a\nb', '-model', 'a;b']) {
			const error = failure(() => CodexBedrockSettings.arguments({ ...request, model }), JSON.stringify(model));

			expect(error.kind, model).toBe('invalid-argument');
			expect(error.message, model).toContain(`Codex model "${model}" is not valid`);
		}
		expect(failure(() => CodexBedrockSettings.arguments({ ...request, profileAlias: 'a b' })).message).toContain(
			'Profile alias "a b" is not valid'
		);
		expect(failure(() => CodexBedrockSettings.arguments({ ...request, region: 'nope' })).message).toContain(
			'AWS region "nope" is not valid'
		);
	});
});

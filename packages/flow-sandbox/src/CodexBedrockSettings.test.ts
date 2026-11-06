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

import { describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { ProviderSecrets } from './ProviderSecrets';
import { rejection } from './testing/ExpectedFailures';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

async function setup(environment: Record<string, string | undefined>): Promise<{
	runtime: FakeSandboxRuntime;
	secrets: ProviderSecrets;
	log: RecordingSandboxLog;
}> {
	const runtime = new FakeSandboxRuntime({ clock: new FakeClock() });
	await runtime.create({ name: 'box-1', agent: 'claude', mounts: [{ hostPath: '/w' }], cpus: 2, memory: '2g' });
	const log = new RecordingSandboxLog();
	return { runtime, secrets: new ProviderSecrets(runtime, environment, log), log };
}

// The key travelling on standard input and never in the arguments is asserted once, at the sbx command line,
// in SbxCliRuntime.test.ts (the service secret of the network and secrets test).
describe('ProviderSecrets', () => {
	it('stores the key of every supported provider from its variable for the sandbox only, and logs the source but not the key', async () => {
		const providers: [string, string][] = [
			['openai', 'OPENAI_API_KEY'],
			['anthropic', 'ANTHROPIC_API_KEY'],
			['openrouter', 'OPENROUTER_API_KEY'],
			['groq', 'GROQ_API_KEY'],
			['mistral', 'MISTRAL_API_KEY'],
			['xai', 'XAI_API_KEY'],
		];
		for (const [provider, variable] of providers) {
			const { runtime, secrets, log } = await setup({ [variable]: '  sk-the-real-key \n' });

			await secrets.install({ sandbox: 'box-1', provider });

			expect([...runtime.state('box-1').serviceSecrets], provider).toEqual([[provider, 'sk-the-real-key']]);
			expect(log.lines, provider).toEqual([
				`info: provider secret stored: sandbox=box-1 service=${provider} source=${variable}`,
			]);
			expect(log.text(), provider).not.toContain('sk-the-real-key');
		}
	});

	it('names the missing (or blank) variable and where to set it', async () => {
		const { runtime, secrets } = await setup({});

		const error = await rejection(secrets.install({ sandbox: 'box-1', provider: 'openai' }));

		expect(error.kind).toBe('invalid-argument');
		expect(error.message).toBe(
			'No API key for "openai": the environment variable OPENAI_API_KEY is not set (or empty) in the process that runs the wrapper. ' +
				'Set it there, or remove this provider from the step.'
		);
		expect(runtime.state('box-1').serviceSecrets.size).toBe(0);

		const blank = await setup({ OPENAI_API_KEY: '   ' });
		const blankError = await rejection(blank.secrets.install({ sandbox: 'box-1', provider: 'openai' }));
		expect(blankError.message).toContain('OPENAI_API_KEY is not set (or empty)');
	});

	it('refuses OAuth with the reason and the alternative, even when a key exists', async () => {
		const { runtime, secrets } = await setup({ OPENAI_API_KEY: 'sk-x' });

		const error = await rejection(
			secrets.install({ sandbox: 'box-1', provider: 'openai', authentication: 'oauth' })
		);

		expect(error.kind).toBe('invalid-argument');
		expect(error.message).toBe(
			'OAuth login for "openai" is not supported in a sandbox: it needs a browser on the host and sbx stores the token for every sandbox, not for this one. ' +
				'Use an API key instead: set OPENAI_API_KEY in the environment of the process that runs the wrapper.'
		);
		expect(runtime.calls.filter(call => call.method === 'setServiceSecret')).toEqual([]);
	});

	it('refuses a provider without API-key support and lists the supported ones', async () => {
		const { secrets } = await setup({});

		const error = await rejection(secrets.install({ sandbox: 'box-1', provider: 'bedrock' }));

		expect(error.message).toBe(
			'Provider "bedrock" has no API-key support yet. Supported: anthropic, openai, openrouter, groq, mistral, xai. ' +
				'(Bedrock does not use this path: it goes through the credential endpoint.)'
		);
	});

	it('lets the runtime error through when the sandbox does not exist', async () => {
		const { secrets } = await setup({ OPENAI_API_KEY: 'sk-x' });

		const error = await rejection(secrets.install({ sandbox: 'ghost-1', provider: 'openai' }));

		expect(error.kind).toBe('not-found');
	});
});

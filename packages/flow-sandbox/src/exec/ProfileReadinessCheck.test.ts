import { describe, expect, it } from 'vitest';

import {
	AwsCredentialError,
	type AwsProcessCredentials,
	type CredentialExportOptions,
	type CredentialSource,
} from '../AwsCredentialExporter';
import { FakeClock } from '../FakeClock';
import { FakeScheduler } from '../FakeScheduler';
import { ProfileAliases } from '../ProfileAliases';
import { SandboxError } from '../SandboxError';
import { ProfileReadinessCheck } from './ProfileReadinessCheck';

const SECRET = 'super-secret-access-key-value';
const CREDENTIALS: AwsProcessCredentials = {
	Version: 1,
	AccessKeyId: 'ASIAFAKEKEYID',
	SecretAccessKey: SECRET,
	SessionToken: 'fake-session-token',
};

class FakeSource implements CredentialSource {
	readonly calls: string[] = [];
	readonly timeouts: Array<number | undefined> = [];
	private readonly pending: Array<() => void> = [];
	/** Per host profile: the error to throw (undefined = succeed). */
	readonly failures = new Map<string, unknown>();
	hold = false;

	async export(hostProfile: string, options?: CredentialExportOptions): Promise<AwsProcessCredentials> {
		this.calls.push(hostProfile);
		this.timeouts.push(options?.timeoutMs);
		if (this.hold) await new Promise<void>(resolve => this.pending.push(resolve));
		const failure = this.failures.get(hostProfile);
		if (failure !== undefined) throw failure;
		return { ...CREDENTIALS };
	}

	release(): void {
		for (const resolve of this.pending.splice(0)) resolve();
	}
}

function setup(entries = ['claude=host-claude', 'codex=host-codex']) {
	const source = new FakeSource();
	const clock = new FakeClock(1000);
	const scheduler = new FakeScheduler(clock);
	const logs: string[] = [];
	const check = new ProfileReadinessCheck({
		aliases: ProfileAliases.parse(entries),
		credentialSource: source,
		clock,
		scheduler,
		log: line => logs.push(line),
	});
	return { source, clock, scheduler, logs, check };
}

const expired = (profile: string) =>
	new AwsCredentialError(
		'sso-expired',
		`The AWS SSO session of profile "${profile}" has expired or was never started. Run "aws sso login --profile ${profile}" on the host, then retry. The wrapper never logs in by itself.`
	);

/** Lets the promise callbacks queued so far run. */
async function flush(): Promise<void> {
	for (let turn = 0; turn < 5; turn++) await Promise.resolve();
}

describe('ProfileReadinessCheck', () => {
	it('is ready when the credentials of the tool profile resolve, and asks for that host profile only', async () => {
		const { source, check } = setup();
		expect(await check.check({ tool: 'claude' })).toEqual({ ready: true });
		expect(source.calls).toEqual(['host-claude']);
	});

	it('makes no AWS call for a script step', async () => {
		const { source, scheduler, check } = setup();
		expect(await check.check({})).toEqual({ ready: true });
		expect(source.calls).toEqual([]);
		expect(scheduler.pendingCount).toBe(0);
	});

	it('maps an expired SSO session to sso-expired with the exporter text and the retry delay', async () => {
		const { source, check } = setup();
		source.failures.set('host-claude', expired('host-claude'));
		expect(await check.check({ tool: 'claude' })).toEqual({
			ready: false,
			reason: 'sso-expired',
			message:
				'The AWS SSO session of profile "host-claude" has expired or was never started. Run "aws sso login --profile host-claude" on the host, then retry. The wrapper never logs in by itself.',
			retryAfterSeconds: 30,
		});
		expect(ProfileReadinessCheck.RETRY_AFTER_SECONDS).toBe(30);
	});

	it.each(['profile-not-found', 'aws-missing', 'aws-failed', 'aws-output-invalid'] as const)(
		'maps the exporter failure %s to aws-credentials-unavailable with the exporter message',
		async code => {
			const { source, check } = setup();
			source.failures.set('host-claude', new AwsCredentialError(code, `do this: ${code}`));
			expect(await check.check({ tool: 'claude' })).toEqual({
				ready: false,
				reason: 'aws-credentials-unavailable',
				message: `do this: ${code}`,
				retryAfterSeconds: 30,
			});
		}
	);

	it('rethrows an error that is not an AwsCredentialError instead of mapping it', async () => {
		const { source, check } = setup();
		const boom = new Error('unexpected');
		source.failures.set('host-claude', boom);
		await expect(check.check({ tool: 'claude' })).rejects.toBe(boom);
	});

	it('lets the SandboxError of a tool without alias propagate, without any AWS call', async () => {
		const { source, check } = setup(['claude=host-claude', 'codex=host-codex']);
		await expect(check.check({ tool: 'opencode' })).rejects.toBeInstanceOf(SandboxError);
		expect(source.calls).toEqual([]);
	});

	it('caches a positive result for 15 s and asks again after', async () => {
		const { source, clock, check } = setup();
		await check.check({ tool: 'claude' });
		clock.advance(14_999);
		await check.check({ tool: 'claude' });
		expect(source.calls).toHaveLength(1);
		clock.advance(1);
		await check.check({ tool: 'claude' });
		expect(source.calls).toHaveLength(2);
		expect(ProfileReadinessCheck.CACHE_MS).toBe(15_000);
	});

	it('never caches a negative: the next ask succeeds right after the login', async () => {
		const { source, check } = setup();
		source.failures.set('host-claude', expired('host-claude'));
		expect((await check.check({ tool: 'claude' })).ready).toBe(false);
		source.failures.delete('host-claude');
		expect(await check.check({ tool: 'claude' })).toEqual({ ready: true });
		expect(source.calls).toHaveLength(2);
	});

	it('shares one in-flight call between concurrent checks of the same profile', async () => {
		const { source, check } = setup();
		source.hold = true;
		const all = Promise.all([
			check.check({ tool: 'claude' }),
			check.check({ tool: 'claude' }),
			check.check({ tool: 'claude' }),
		]);
		await flush();
		source.release();
		expect(await all).toEqual([{ ready: true }, { ready: true }, { ready: true }]);
		expect(source.calls).toHaveLength(1);
	});

	it('shares a failing in-flight call, then asks again (the failure is not kept)', async () => {
		const { source, check } = setup();
		source.hold = true;
		source.failures.set('host-claude', expired('host-claude'));
		const both = Promise.all([check.check({ tool: 'claude' }), check.check({ tool: 'claude' })]);
		await flush();
		source.release();
		const results = await both;
		expect(results.every(result => !result.ready)).toBe(true);
		expect(source.calls).toHaveLength(1);
		source.hold = false;
		source.failures.clear();
		expect(await check.check({ tool: 'claude' })).toEqual({ ready: true });
	});

	it('judges each tool by its own alias: an expired claude does not block codex', async () => {
		const { source, check } = setup();
		source.failures.set('host-claude', expired('host-claude'));
		expect((await check.check({ tool: 'claude' })).ready).toBe(false);
		expect(await check.check({ tool: 'codex' })).toEqual({ ready: true });
		expect(source.calls).toEqual(['host-claude', 'host-codex']);
	});

	it('never puts a credential value in a result or in the log', async () => {
		const { source, logs, check } = setup();
		const ok = await check.check({ tool: 'claude' });
		source.failures.set('host-codex', expired('host-codex'));
		const bad = await check.check({ tool: 'codex' });
		const everything = JSON.stringify([ok, bad, logs]);
		for (const value of [SECRET, CREDENTIALS.AccessKeyId, CREDENTIALS.SessionToken as string]) {
			expect(everything).not.toContain(value);
		}
		expect(logs.length).toBeGreaterThan(0);
	});

	describe('time bound', () => {
		it('asks the exporter for a 8000 ms limit, so the AWS CLI child is killed by its runner', async () => {
			const { source, check } = setup();
			await check.check({ tool: 'claude' });
			expect(ProfileReadinessCheck.CHECK_TIMEOUT_MS).toBe(8000);
			expect(source.timeouts).toEqual([8000]);
		});

		it('answers check-timeout within 8000 ms of fake time when the call never ends, naming the profile and the login', async () => {
			const { source, clock, scheduler, check } = setup();
			source.hold = true;
			const started = clock.now();
			const answer = check.check({ tool: 'claude' });
			await flush();
			scheduler.advance(7999);
			await flush();
			expect(scheduler.pendingCount).toBe(1);
			scheduler.advance(1);
			const result = await answer;
			expect(clock.now() - started).toBeLessThanOrEqual(8000);
			expect(result).toMatchObject({ ready: false, reason: 'check-timeout', retryAfterSeconds: 30 });
			const message = (result as { message: string }).message;
			expect(message).toContain('"host-claude"');
			expect(message).toContain('8 s');
			expect(message).toContain('aws sso login --profile host-claude');
			expect(message).toContain('never logs in by itself');
		});

		it('maps the exporter timeout (child killed) to the same check-timeout answer', async () => {
			const { source, check } = setup();
			source.failures.set('host-claude', new AwsCredentialError('timeout', 'exporter text'));
			expect(await check.check({ tool: 'claude' })).toMatchObject({ ready: false, reason: 'check-timeout' });
		});

		it('ignores a slow success that arrives after the timeout: nothing is cached and the next ask starts a fresh call', async () => {
			const { source, scheduler, check } = setup();
			source.hold = true;
			const answer = check.check({ tool: 'claude' });
			await flush();
			scheduler.advance(8000);
			expect((await answer).ready).toBe(false);
			source.release();
			await flush();

			source.hold = false;
			expect(await check.check({ tool: 'claude' })).toEqual({ ready: true });
			expect(source.calls).toHaveLength(2);
		});

		it('takes the limit from the timeoutMs option', async () => {
			const source = new FakeSource();
			const clock = new FakeClock(0);
			const scheduler = new FakeScheduler(clock);
			const check = new ProfileReadinessCheck({
				aliases: ProfileAliases.parse(['claude=host-claude']),
				credentialSource: source,
				clock,
				scheduler,
				log: () => undefined,
				timeoutMs: 40_000,
			});
			source.hold = true;
			const answer = check.check({ tool: 'claude' });
			await flush();
			scheduler.advance(39_999);
			expect(scheduler.pendingCount).toBe(1);
			scheduler.advance(1);
			expect(await answer).toMatchObject({ reason: 'check-timeout' });
			expect(source.timeouts).toEqual([40_000]);
		});

		it('cancels the timer when the call ends first', async () => {
			const { scheduler, check } = setup();
			await check.check({ tool: 'claude' });
			expect(scheduler.pendingCount).toBe(0);
		});

		it('does not turn a late unexpected error into an unhandled rejection', async () => {
			const { source, scheduler, check } = setup();
			source.hold = true;
			source.failures.set('host-claude', new Error('late boom'));
			const answer = check.check({ tool: 'claude' });
			await flush();
			scheduler.advance(8000);
			expect((await answer).ready).toBe(false);
			source.release();
			await flush();
		});
	});
});

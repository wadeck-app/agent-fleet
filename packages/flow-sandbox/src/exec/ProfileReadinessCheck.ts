import { AwsCredentialError, type CredentialSource } from '../AwsCredentialExporter';
import type { Clock } from '../Clock';
import type { ModelTool } from '../ModelTool';
import type { ProfileAliases } from '../ProfileAliases';
import type { Scheduler } from '../Scheduler';

export type ReadinessAnswer =
	{ ready: true } | { ready: false; reason: string; message: string; retryAfterSeconds: number };

export interface ProfileReadinessCheckOptions {
	aliases: ProfileAliases;
	credentialSource: CredentialSource;
	clock: Clock;
	scheduler: Scheduler;
	/** One line per check (profile names only, never credentials). */
	log: (line: string) => void;
	/** Limit of one credential resolution. Default {@link ProfileReadinessCheck.CHECK_TIMEOUT_MS}. */
	timeoutMs?: number;
}

/**
 * "Are you ready for this step?": a model step is ready when the credentials of its tool's host profile resolve
 * (`aws configure export-credentials`, through the injected source). Check only: nothing is renewed and no login
 * is started, the wrapper never logs in by itself.
 *
 * - A script step (no tool) is ready without any AWS call.
 * - A tool without alias makes `ProfileAliases.aliasFor` throw a SandboxError; it propagates unchanged (that
 *   is a source misconfiguration, the early check's job, never mapped to a readiness reason).
 * - Failures: `sso-expired` (the exporter's own text), `check-timeout` (no answer within the limit),
 *   `aws-credentials-unavailable` (any other exporter failure, with the exporter's own message). Any other
 *   error type is rethrown.
 * - A positive result is cached per host profile for {@link CACHE_MS}; a negative one never is. Concurrent
 *   checks of one profile share one call. A call that ended after the timeout is ignored (no cache, no stuck entry).
 * - Credentials returned by the source are discarded at once and never logged or put in a message.
 */
export class ProfileReadinessCheck {
	/** A positive answer is reused for this long (ms, clock based). */
	static readonly CACHE_MS = 15_000;
	/** `retryAfterSeconds` of every not-ready answer. */
	static readonly RETRY_AFTER_SECONDS = 30;
	/**
	 * Default limit (ms) of one credential resolution: the AWS CLI child is killed by its runner at that
	 * moment and the answer is `check-timeout`, so a browser or device-code prompt cannot hold the answer.
	 * The flow owner caps one check at 8 s; the `timeoutMs` option overrides it.
	 */
	static readonly CHECK_TIMEOUT_MS = 8000;

	private readonly timeoutMs: number;
	private readonly readyUntil = new Map<string, number>();
	private readonly inFlight = new Map<string, Promise<ReadinessAnswer>>();

	constructor(private readonly options: ProfileReadinessCheckOptions) {
		this.timeoutMs = options.timeoutMs ?? ProfileReadinessCheck.CHECK_TIMEOUT_MS;
	}

	async check(request: { tool?: ModelTool }): Promise<ReadinessAnswer> {
		if (request.tool === undefined) return { ready: true };
		const alias = this.options.aliases.aliasFor(request.tool);
		const hostProfile = this.options.aliases.hostProfiles()[alias] as string;

		const validUntil = this.readyUntil.get(hostProfile);
		if (validUntil !== undefined) {
			if (this.options.clock.now() < validUntil) return { ready: true };
			this.readyUntil.delete(hostProfile);
		}
		const running = this.inFlight.get(hostProfile);
		if (running !== undefined) return running;

		const started = this.resolve(hostProfile).finally(() => {
			if (this.inFlight.get(hostProfile) === started) this.inFlight.delete(hostProfile);
		});
		this.inFlight.set(hostProfile, started);
		return started;
	}

	private resolve(hostProfile: string): Promise<ReadinessAnswer> {
		return new Promise<ReadinessAnswer>((resolve, reject) => {
			let answered = false;
			const answer = (value: ReadinessAnswer): void => {
				if (answered) return;
				answered = true;
				cancelTimer();
				this.options.log(`readiness of profile "${hostProfile}": ${value.ready ? 'ready' : value.reason}`);
				resolve(value);
			};
			const cancelTimer = this.options.scheduler.schedule(this.timeoutMs, () =>
				answer(this.timedOut(hostProfile))
			);

			this.options.credentialSource.export(hostProfile, { timeoutMs: this.timeoutMs }).then(
				() => {
					// The credentials are not even bound to a name: only the fact that they resolved matters.
					if (answered) return;
					this.readyUntil.set(hostProfile, this.options.clock.now() + ProfileReadinessCheck.CACHE_MS);
					answer({ ready: true });
				},
				(error: unknown) => {
					if (answered) {
						// Late failure of a call already answered as a timeout: nothing left to tell the caller.
						this.options.log(
							`readiness of profile "${hostProfile}": late failure ignored after the timeout`
						);
						return;
					}
					try {
						answer(this.notReady(hostProfile, error));
					} catch (unexpected) {
						answered = true;
						cancelTimer();
						reject(unexpected);
					}
				}
			);
		});
	}

	private notReady(hostProfile: string, error: unknown): ReadinessAnswer {
		if (!(error instanceof AwsCredentialError)) throw error;
		switch (error.code) {
			case 'sso-expired':
				return this.refusal('sso-expired', error.message);
			case 'timeout':
				return this.timedOut(hostProfile);
			case 'profile-not-found':
			case 'aws-missing':
			case 'aws-failed':
			case 'aws-output-invalid':
				return this.refusal('aws-credentials-unavailable', error.message);
			default:
				throw error;
		}
	}

	private timedOut(hostProfile: string): ReadinessAnswer {
		const seconds = this.timeoutMs / 1000;
		return this.refusal(
			'check-timeout',
			`The AWS CLI did not answer within ${seconds} s for profile "${hostProfile}" (a device-code or browser prompt may be waiting). Run "aws sso login --profile ${hostProfile}" in a terminal, then retry. The wrapper never logs in by itself.`
		);
	}

	private refusal(reason: string, message: string): ReadinessAnswer {
		return { ready: false, reason, message, retryAfterSeconds: ProfileReadinessCheck.RETRY_AFTER_SECONDS };
	}
}

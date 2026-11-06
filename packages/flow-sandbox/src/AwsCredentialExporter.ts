import type { CommandRunner } from './CommandRunner';
import { SandboxError } from './SandboxError';

export type AwsCredentialErrorCode =
	/** The SSO session of the host profile expired: the person must run `aws sso login`. */
	| 'sso-expired'
	/** The host profile does not exist in the AWS configuration of the host. */
	| 'profile-not-found'
	/** The `aws` executable cannot be started. */
	| 'aws-missing'
	/** The `aws` command did not finish in time. */
	| 'timeout'
	/** The `aws` command failed for another reason (stderr is quoted in the message). */
	| 'aws-failed'
	/** The `aws` command succeeded but printed something that is not a credential document. */
	| 'aws-output-invalid';

/** A credential request that failed on the host. `message` always says what to do next. */
export class AwsCredentialError extends Error {
	constructor(
		readonly code: AwsCredentialErrorCode,
		message: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
		this.name = 'AwsCredentialError';
	}
}

/** The document `credential_process` must print (AWS CLI "process" format, version 1). */
export interface AwsProcessCredentials {
	Version: 1;
	AccessKeyId: string;
	SecretAccessKey: string;
	SessionToken?: string;
	Expiration?: string;
}

/** Where the credentials of a host profile come from. The endpoint depends on this, not on the AWS CLI. */
export interface CredentialSource {
	/** Short-lived credentials of the host profile, or an AwsCredentialError. */
	export(hostProfile: string): Promise<AwsProcessCredentials>;
}

export interface AwsCredentialExporterOptions {
	commandRunner: CommandRunner;
	/** The AWS CLI executable. Default `aws`. */
	awsCommand?: string;
	/** Time limit of one `aws` call. Default 30 s (an SSO refresh can be slow). */
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const SSO_EXPIRED = /\bsso\b|token has expired|refresh failed/i;
const PROFILE_NOT_FOUND = /profile \(?[^\n]*could not be found|ProfileNotFound/i;

/**
 * Resolves short-lived credentials with `aws configure export-credentials --profile P --format process`.
 * The command runs through the injected CommandRunner (no shell); credentials never leave this class
 * except in the returned value, and error messages quote stderr but never stdout.
 */
export class AwsCredentialExporter implements CredentialSource {
	private readonly awsCommand: string;
	private readonly timeoutMs: number;

	constructor(private readonly options: AwsCredentialExporterOptions) {
		this.awsCommand = options.awsCommand ?? 'aws';
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async export(hostProfile: string): Promise<AwsProcessCredentials> {
		const result = await this.run(hostProfile);
		if (result.exitCode !== 0) {
			throw this.failure(hostProfile, result.stderr);
		}
		return this.parse(hostProfile, result.stdout);
	}

	private async run(hostProfile: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		try {
			return await this.options.commandRunner.run({
				command: this.awsCommand,
				args: ['configure', 'export-credentials', '--profile', hostProfile, '--format', 'process'],
				timeoutMs: this.timeoutMs,
			});
		} catch (error) {
			if (error instanceof SandboxError && error.kind === 'binary-missing') {
				throw new AwsCredentialError(
					'aws-missing',
					`The AWS CLI ("${this.awsCommand}") cannot be started on the host. Install AWS CLI v2 and make sure "${this.awsCommand}" is on the PATH of the process that runs the wrapper.`,
					{ cause: error }
				);
			}
			if (error instanceof SandboxError && error.kind === 'timeout') {
				throw new AwsCredentialError(
					'timeout',
					`"aws configure export-credentials --profile ${hostProfile}" did not finish within ${this.timeoutMs} ms. If a browser window or device-code prompt is waiting, run "aws sso login --profile ${hostProfile}" in a terminal and retry.`,
					{ cause: error }
				);
			}
			throw error;
		}
	}

	private failure(hostProfile: string, stderr: string): AwsCredentialError {
		const detail = stderr.trim().split(/\r?\n/)[0] ?? '';
		if (PROFILE_NOT_FOUND.test(stderr)) {
			return new AwsCredentialError(
				'profile-not-found',
				`The AWS profile "${hostProfile}" does not exist on the host (${detail}). List the profiles with "aws configure list-profiles" and fix the "profiles" option that maps aliases to host profiles.`
			);
		}
		if (SSO_EXPIRED.test(stderr)) {
			return new AwsCredentialError(
				'sso-expired',
				`The AWS SSO session of profile "${hostProfile}" has expired or was never started. Run "aws sso login --profile ${hostProfile}" on the host, then retry. The wrapper never logs in by itself.`
			);
		}
		return new AwsCredentialError(
			'aws-failed',
			`"aws configure export-credentials --profile ${hostProfile}" failed: ${detail === '' ? '(no error output)' : detail}`
		);
	}

	private parse(hostProfile: string, stdout: string): AwsProcessCredentials {
		let document: unknown;
		try {
			document = JSON.parse(stdout);
		} catch {
			// No `cause`: the V8 parse error quotes a piece of the text, which may be a credential.
			throw new AwsCredentialError(
				'aws-output-invalid',
				`"aws configure export-credentials --profile ${hostProfile}" printed text that is not JSON. Check the AWS CLI version (v2 is required); the output is not quoted here because it may contain credentials.`
			);
		}
		const candidate = document as Partial<Record<keyof AwsProcessCredentials, unknown>> | null;
		if (
			candidate === null ||
			typeof candidate !== 'object' ||
			candidate.Version !== 1 ||
			typeof candidate.AccessKeyId !== 'string' ||
			typeof candidate.SecretAccessKey !== 'string' ||
			candidate.AccessKeyId === '' ||
			candidate.SecretAccessKey === ''
		) {
			throw new AwsCredentialError(
				'aws-output-invalid',
				`"aws configure export-credentials --profile ${hostProfile}" did not print a version 1 credential document (Version, AccessKeyId, SecretAccessKey). The output is not quoted here because it may contain credentials.`
			);
		}
		// Only the documented fields are forwarded to the sandbox.
		const credentials: AwsProcessCredentials = {
			Version: 1,
			AccessKeyId: candidate.AccessKeyId,
			SecretAccessKey: candidate.SecretAccessKey,
		};
		if (typeof candidate.SessionToken === 'string') credentials.SessionToken = candidate.SessionToken;
		if (typeof candidate.Expiration === 'string') credentials.Expiration = candidate.Expiration;
		return credentials;
	}
}

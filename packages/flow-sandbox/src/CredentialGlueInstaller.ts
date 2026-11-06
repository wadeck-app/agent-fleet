import { AwsConfigFile } from './AwsConfigFile';
import { CredentialProcessScript } from './CredentialProcessScript';
import { SandboxError } from './SandboxError';
import type { SandboxRuntime } from './SandboxRuntime';

export interface CredentialGlueRequest {
	sandbox: string;
	endpointPort: number;
	aliases: readonly string[];
	region: string;
}

/** Where the glue lives in the VM and which variable points the AWS tools to it. */
export interface InstalledCredentialGlue {
	scriptPath: string;
	awsConfigPath: string;
	/** Environment for the tool process: `AWS_CONFIG_FILE` and `AWS_REGION`. The profile is chosen by the caller (`AWS_PROFILE`). */
	env: Readonly<Record<string, string>>;
}

const DEFAULT_DIRECTORY = '/home/agent/.flow-credentials';

/**
 * Writes the two VM-side files of the credential path: the credential_process script (mode 0700) and the AWS
 * config file that uses it. They live under the VM home, NOT on a mount, so they are neither visible on the host
 * nor part of the run's files; they disappear with the sandbox and survive stop/start.
 */
export class CredentialGlueInstaller {
	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly directory: string = DEFAULT_DIRECTORY
	) {}

	async install(request: CredentialGlueRequest): Promise<InstalledCredentialGlue> {
		const scriptPath = `${this.directory}/credential-process.sh`;
		const awsConfigPath = `${this.directory}/aws-config`;
		// Render first: nothing is written when the request is invalid.
		const script = CredentialProcessScript.render(request.endpointPort);
		const config = AwsConfigFile.render({ aliases: request.aliases, region: request.region, scriptPath });

		await this.write(request.sandbox, scriptPath, '0700', script);
		await this.write(request.sandbox, awsConfigPath, '0600', config);
		return {
			scriptPath,
			awsConfigPath,
			env: { AWS_CONFIG_FILE: awsConfigPath, AWS_REGION: request.region },
		};
	}

	private async write(sandbox: string, filePath: string, mode: string, content: string): Promise<void> {
		const result = await this.runtime.exec({
			sandbox,
			// Paths and mode are positional arguments of the script, never spliced into its text.
			command: [
				'bash',
				'-c',
				'set -e; mkdir -p "$(dirname "$1")"; cat > "$1"; chmod "$2" "$1"',
				'flow-credential-glue',
				filePath,
				mode,
			],
			stdin: content,
		});
		if (result.exitCode !== 0) {
			throw new SandboxError(
				'command-failed',
				`Writing ${filePath} in sandbox "${sandbox}" failed with exit code ${result.exitCode}: ${result.stderr.trim() || '(no error output)'}. ` +
					'Check that the image has bash and that /home/agent is writable.',
				{ sandbox, exitCode: result.exitCode, stderr: result.stderr }
			);
		}
	}
}

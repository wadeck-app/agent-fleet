import { requireAwsRegion } from './AwsRegion';
import { requireProfileAlias } from './ProfileAlias';
import { SandboxError } from './SandboxError';

export interface AwsConfigFileRequest {
	/** Profile aliases to declare; each becomes `[profile <alias>]`. */
	aliases: readonly string[];
	region: string;
	/** Absolute path of the credential_process script inside the VM. */
	scriptPath: string;
}

/**
 * The AWS config file of the VM (`AWS_CONFIG_FILE` points to it): one profile per alias whose credentials come
 * from `credential_process`, the script that asks the host endpoint. Nothing secret is in it.
 */
export class AwsConfigFile {
	static render(request: AwsConfigFileRequest): string {
		requireAwsRegion(request.region);
		if (request.aliases.length === 0) {
			throw new SandboxError('invalid-argument', 'An AWS config file needs at least one profile alias.');
		}
		if (new Set(request.aliases).size !== request.aliases.length) {
			throw new SandboxError(
				'invalid-argument',
				`Profile aliases must be unique, got: ${request.aliases.join(', ')}. A repeated section would silently override the first.`
			);
		}
		if (!/^\/[A-Za-z0-9._/-]+$/.test(request.scriptPath)) {
			throw new SandboxError(
				'invalid-argument',
				`The credential script path "${request.scriptPath}" must be an absolute sandbox path of letters, digits and . _ / - (it is written into credential_process, which splits on spaces).`
			);
		}
		const sections = request.aliases.map(alias => {
			requireProfileAlias(alias);
			return [
				`[profile ${alias}]`,
				`credential_process = ${request.scriptPath} ${alias}`,
				`region = ${request.region}`,
			].join('\n');
		});
		return `${sections.join('\n\n')}\n`;
	}
}

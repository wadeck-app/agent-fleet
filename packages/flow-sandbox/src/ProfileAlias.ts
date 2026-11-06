import { SandboxError } from './SandboxError';

/** Aliases travel in a URL query and in the AWS config of the VM: letters, digits, "_" and "-". */
export const PROFILE_ALIAS_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Returns the alias when valid, otherwise throws with the allowed form. */
export function requireProfileAlias(alias: string): string {
	if (!PROFILE_ALIAS_PATTERN.test(alias)) {
		throw new SandboxError(
			'invalid-argument',
			`Profile alias "${alias}" is not valid: use 1 to 64 letters, digits, "_" or "-" (it travels in a URL and in the AWS config of the VM).`
		);
	}
	return alias;
}

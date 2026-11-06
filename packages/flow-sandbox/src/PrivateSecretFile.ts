import * as fs from 'node:fs';
import * as path from 'node:path';

import { SandboxError } from './SandboxError';

/** Characters a shell would treat specially inside the double quotes of the `cat` command. */
const UNSAFE_IN_COMMAND = /["$`\\\0\r\n]/;

/**
 * A file holding one sandbox's credential-endpoint secret, in its own owner-only directory under the host
 * temporary directory (never inside a sandbox mount: sbx requires helpers outside writable mounts).
 * `sbx secret set-custom --command` reads it with `valueCommand`, so the secret never appears on a command
 * line. `dispose()` removes it; call it when the sandbox is removed.
 */
export class PrivateSecretFile {
	private constructor(
		readonly filePath: string,
		private readonly directory: string
	) {}

	static create(tempDirectory: string, secret: string): PrivateSecretFile {
		if (secret === '' || /[\0\r\n]/.test(secret)) {
			throw new SandboxError(
				'invalid-argument',
				'The secret to store is empty or contains a newline or NUL character; it must be one line of text.'
			);
		}
		const directory = fs.mkdtempSync(path.join(tempDirectory, 'flow-sandbox-secret-'));
		const filePath = path.join(directory, 'secret');
		try {
			// No trailing newline: the command output is the secret as is.
			fs.writeFileSync(filePath, secret, { mode: 0o600 });
		} catch (error) {
			fs.rmSync(directory, { recursive: true, force: true });
			throw error;
		}
		return new PrivateSecretFile(filePath, directory);
	}

	/**
	 * The command sbx runs on the host to read the secret. Windows paths use forward slashes
	 * (`cat C:/Users/...`, verified with sbx 0.49.2 on Windows 10); `cat` must be on the PATH of the sbx daemon
	 * (Git for Windows provides it). sbx runs the command once when the secret is stored, so a missing `cat`
	 * fails at `setSecret`, not later.
	 */
	valueCommand(platform: NodeJS.Platform = process.platform): string {
		// On Windows a backslash is a separator; elsewhere it is a character the quoting below cannot protect.
		const printable = platform === 'win32' ? this.filePath.replace(/\\/g, '/') : this.filePath;
		if (UNSAFE_IN_COMMAND.test(printable)) {
			throw new SandboxError(
				'invalid-argument',
				`The secret file path "${this.filePath}" contains a character that cannot be quoted safely in a shell command. ` +
					'Use a temporary directory whose path has only letters, digits, spaces and . _ - / :'
			);
		}
		return `cat "${printable}"`;
	}

	dispose(): void {
		fs.rmSync(this.directory, { recursive: true, force: true });
	}
}

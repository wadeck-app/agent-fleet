import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrivateAcl } from './PrivateAcl';
import { SandboxError } from './SandboxError';

/** Characters a POSIX shell would treat specially inside the double quotes of the `cat` command. */
const UNSAFE_IN_POSIX_COMMAND = /["$`\\\0\r\n]/;
/** Characters cmd.exe would treat specially inside the double quotes of the `type` command (`%VAR%`, `!`, `^`, operators). */
const UNSAFE_IN_CMD_COMMAND = /["%^&|<>!\0\r\n]/;

/**
 * A file holding one sandbox's credential-endpoint secret, in its own owner-only directory (modes; on Windows the ACL is
 * restricted to the current user, see PrivateAcl) under the host temporary directory (never inside a sandbox mount: sbx requires helpers outside writable mounts).
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
			// Before the secret is written: nothing secret ever sits under the inherited ACL of the temporary folder.
			PrivateAcl.restrictToCurrentUser(directory, 'directory');
			// No trailing newline: the command output is the secret as is.
			fs.writeFileSync(filePath, secret, { mode: 0o600 });
			PrivateAcl.restrictToCurrentUser(filePath, 'file');
		} catch (error) {
			fs.rmSync(directory, { recursive: true, force: true });
			throw error;
		}
		return new PrivateSecretFile(filePath, directory);
	}

	/**
	 * The command sbx runs on the host to read the secret, once, when the secret is stored. On Windows sbx runs it through cmd.exe with the PATH
	 * of the process that called sbx (measured with sbx 0.51.0: `cat` failed with "'cat' is not recognized" as soon as Git for Windows' usr\bin
	 * was off that PATH), so it is the cmd built-in `type` with backslashes: no Git for Windows needed. Elsewhere it is `cat`.
	 */
	valueCommand(platform: NodeJS.Platform = process.platform): string {
		const windows = platform === 'win32';
		// On Windows a backslash is a separator; elsewhere it is a character the quoting below cannot protect.
		const printable = windows ? this.filePath.replace(/\//g, '\\') : this.filePath;
		if ((windows ? UNSAFE_IN_CMD_COMMAND : UNSAFE_IN_POSIX_COMMAND).test(printable)) {
			throw new SandboxError(
				'invalid-argument',
				`The secret file path "${this.filePath}" contains a character that cannot be quoted safely in a shell command. ` +
					`Use a temporary directory whose path has only letters, digits, spaces and ${windows ? '. _ - \\ :' : '. _ - / :'}`
			);
		}
		return `${windows ? 'type' : 'cat'} "${printable}"`;
	}

	dispose(): void {
		fs.rmSync(this.directory, { recursive: true, force: true });
	}
}

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrivateAcl } from './PrivateAcl';
import { SandboxRequestValidator } from './SandboxRequestValidator';

/**
 * A `KEY=value` file in a private temporary directory, handed to `sbx exec --env-file` so that values
 * (which may be credentials) never appear on a command line or in a process list.
 * The directory is created owner-only and removed by `dispose()`.
 */
export class PrivateEnvFile {
	private constructor(
		readonly filePath: string,
		private readonly directory: string
	) {}

	/** Throws SandboxError('invalid-argument') for a name or value an env file cannot carry, before touching the disk. */
	static create(tempDirectory: string, env: Readonly<Record<string, string>>): PrivateEnvFile {
		new SandboxRequestValidator().env(env);
		const lines = Object.entries(env).map(([name, value]) => `${name}=${value}`);

		const directory = fs.mkdtempSync(path.join(tempDirectory, 'flow-sandbox-env-'));
		const filePath = path.join(directory, 'env');
		try {
			// Before the values are written (they may be credentials); see PrivateAcl for what this does on Windows.
			PrivateAcl.restrictToCurrentUser(directory, 'directory');
			fs.writeFileSync(filePath, `${lines.join('\n')}\n`, { mode: 0o600 });
			PrivateAcl.restrictToCurrentUser(filePath, 'file');
		} catch (error) {
			fs.rmSync(directory, { recursive: true, force: true });
			throw error;
		}
		return new PrivateEnvFile(filePath, directory);
	}

	dispose(): void {
		fs.rmSync(this.directory, { recursive: true, force: true });
	}
}

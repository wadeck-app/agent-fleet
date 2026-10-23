import * as fs from 'node:fs';
import * as path from 'node:path';

import { Secret } from './Secret';
import { ACCEPTED_REFERENCES, SecretSourceError, SecretTooShortError, SecretUnresolvedError } from './SecretErrors';
import { MIN_SECRET_LENGTH } from './SecretMasker';

/**
 * Turns a secret reference into a Secret.
 *
 * Accepted references:
 *   env://NAME       -- the variable of the injected environment (the DAEMON's, not the
 *                       shell that ran `flow run`)
 *   file://./rel     -- a file relative to `baseDir` (the run's cwd); one trailing CR/LF trimmed
 *
 * Everything else is refused: `value://` and bare literals would put the secret on a command
 * line (which is logged), `input://` would read a literal from another input, absolute and
 * escaping file paths would read outside the project.
 *
 * Error messages name the secret and the reference, never a value and never a literal that was
 * passed in place of a reference.
 */
export class SecretProvider {
	constructor(
		private readonly baseDir: string,
		private readonly env: Readonly<Record<string, string | undefined>> = process.env
	) {}

	/** True for the references {@link resolve} can read (the scheme only; nothing is read or checked). */
	static isAcceptedReference(value: string): boolean {
		return value.startsWith('env://') || value.startsWith('file://');
	}

	resolve(secretName: string, reference: string): Secret {
		const value = this.read(secretName, reference);
		if (value.length < MIN_SECRET_LENGTH) {
			throw new SecretTooShortError(secretName, reference);
		}
		return new Secret(value);
	}

	private read(secretName: string, reference: string): string {
		if (reference.startsWith('env://')) {
			return this.readEnv(secretName, reference);
		}
		if (reference.startsWith('file://')) {
			return this.readFile(secretName, reference);
		}
		throw new SecretSourceError(this.describeRefusal(secretName, reference), secretName);
	}

	private describeRefusal(secretName: string, reference: string): string {
		const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(reference)?.[1];
		const accepted = `Use ${ACCEPTED_REFERENCES}.`;
		if (scheme === 'input') {
			return (
				`Secret '${secretName}': input:// is not supported (it would read a literal from another ` +
				`command-line input, and command lines are logged). ${accepted}`
			);
		}
		if (scheme === 'value') {
			return `Secret '${secretName}': value:// is forbidden (a literal secret would be logged). ${accepted}`;
		}
		if (scheme !== undefined) {
			return `Secret '${secretName}': unsupported reference scheme '${scheme}://'. ${accepted}`;
		}
		return (
			`Secret '${secretName}': the value given is not a reference, so it was not used ` +
			`(a literal secret would end up in command lines and logs). ${accepted}`
		);
	}

	private readEnv(secretName: string, reference: string): string {
		const variable = reference.slice('env://'.length);
		const value = this.env[variable];
		if (value === undefined || value === '') {
			throw new SecretUnresolvedError(
				`Secret '${secretName}' cannot be resolved: environment variable '${variable}' (from ${reference}) ` +
					`is not set or is empty in the daemon's environment. The daemon reads its own environment, captured ` +
					`when it started: export '${variable}' and restart the daemon, or store the value in a file and ` +
					`reference it with file://./path/to/file.`,
				secretName
			);
		}
		return value;
	}

	private readFile(secretName: string, reference: string): string {
		const relativePath = reference.slice('file://'.length);
		if (path.isAbsolute(relativePath)) {
			throw new SecretSourceError(
				`Secret '${secretName}': absolute file paths are forbidden (${reference}). ` +
					`Use a path relative to the directory flow run was started from, e.g. file://./secrets/token.txt.`,
				secretName
			);
		}
		const resolved = path.resolve(this.baseDir, relativePath);
		this.assertInside(secretName, reference, this.baseDir, resolved, 'Path traversal detected');
		if (!fs.existsSync(resolved)) {
			throw new SecretUnresolvedError(
				`Secret '${secretName}' cannot be resolved: file '${resolved}' (from ${reference}) does not exist. ` +
					`Create it, or fix the path (relative to the directory flow run was started from).`,
				secretName
			);
		}
		const realPath = fs.realpathSync(resolved);
		this.assertInside(secretName, reference, fs.realpathSync(this.baseDir), realPath, 'Symlink escape detected');
		const value = fs.readFileSync(realPath, 'utf8').replace(/\r?\n$/, '');
		if (value === '') {
			throw new SecretUnresolvedError(
				`Secret '${secretName}' cannot be resolved: file '${resolved}' (from ${reference}) is empty.`,
				secretName
			);
		}
		return value;
	}

	private assertInside(secretName: string, reference: string, root: string, target: string, label: string): void {
		const relative = path.relative(root, target);
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new SecretSourceError(
				`Secret '${secretName}': ${label} in ${reference}. The file must stay inside the directory flow run was started from.`,
				secretName
			);
		}
	}
}

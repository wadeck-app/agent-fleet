import * as fs from 'node:fs';
import * as path from 'node:path';

import { Secret } from './Secret';

export class SecretResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SecretResolutionError';
	}
}

/**
 * Resolves secret URI schemes to Secret objects.
 *
 * Supported schemes:
 *   env://NAME        -- reads process.env[NAME] at resolve time
 *   file://./rel      -- reads file relative to workspaceDir
 *   file:///abs       -- reads absolute path (forbidden by default)
 *   input://name      -- reads from flow inputs
 *
 * value:// is forbidden in secrets (validated before reaching here).
 */
export class SecretProvider {
	constructor(
		private readonly workspaceDir: string,
		private readonly inputs: Record<string, string>
	) {}

	resolve(uri: string): Secret {
		if (uri.startsWith('env://')) {
			const name = uri.slice('env://'.length);
			const value = process.env[name];
			if (value === undefined) {
				throw new SecretResolutionError(`env var '${name}' not set (referenced by env://${name})`);
			}
			return new Secret(value);
		}

		if (uri.startsWith('file://')) {
			const filePath = uri.slice('file://'.length);
			if (path.isAbsolute(filePath)) {
				throw new SecretResolutionError(
					`Absolute file paths in secrets are forbidden: ${uri}. Use a relative path (file://./relative/path).`
				);
			}
			const resolved = path.resolve(this.workspaceDir, filePath);
			// Prevent path traversal: resolved path must stay within workspaceDir
			const relative = path.relative(this.workspaceDir, resolved);
			if (relative.startsWith('..') || path.isAbsolute(relative)) {
				throw new SecretResolutionError(
					`Path traversal detected in secret URI: ${uri}. The resolved path must stay within the workspace directory.`
				);
			}
			if (!fs.existsSync(resolved)) {
				throw new SecretResolutionError(`Secret file not found: ${resolved}`);
			}
			// Resolve symlinks and re-check: prevents symlink pointing outside workspaceDir
			let realPath: string;
			try {
				realPath = fs.realpathSync(resolved);
			} catch {
				throw new SecretResolutionError(`Cannot resolve secret file path: ${resolved}`);
			}
			const realWorkspaceDir = fs.realpathSync(this.workspaceDir);
			const realRelative = path.relative(realWorkspaceDir, realPath);
			if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
				throw new SecretResolutionError(
					`Symlink escape detected in secret URI: ${uri}. The resolved path must stay within the workspace directory.`
				);
			}
			return new Secret(fs.readFileSync(realPath, 'utf8'));
		}

		if (uri.startsWith('input://')) {
			const name = uri.slice('input://'.length);
			const value = this.inputs[name];
			if (value === undefined) {
				throw new SecretResolutionError(`input '${name}' not provided (referenced by input://${name})`);
			}
			return new Secret(value);
		}

		if (uri.startsWith('value://')) {
			throw new SecretResolutionError(
				`value:// is forbidden in secrets -- use env://, file://, or input:// instead`
			);
		}

		throw new SecretResolutionError(`Unknown secret URI scheme: ${uri}`);
	}
}

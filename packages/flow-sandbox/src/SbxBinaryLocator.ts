import * as fs from 'node:fs';
import * as path from 'node:path';

import { PINNED_SBX_VERSION, sbxReleaseUrl } from './PinnedSbxVersion';
import { SandboxError } from './SandboxError';

/** A runnable sbx: script mocks (`.mjs`, `.js`, `.cjs`) run through node because they are not executable on Windows. */
export interface SbxBinary {
	command: string;
	/** Arguments placed before the sbx arguments (the script path for a script mock). */
	prefixArgs: readonly string[];
	/** What the user configured, for messages. */
	displayPath: string;
}

export interface SbxBinaryLocatorOptions {
	/** Explicit executable path. When set it is the only candidate: no silent fallback to another sbx. */
	binaryPath?: string;
	env: NodeJS.ProcessEnv;
	platform: NodeJS.Platform;
	/** Interpreter used for script mocks. */
	nodeExecutable: string;
	/** Is there a regular file at this path? Default: a real file-system check. */
	fileExists?: (candidate: string) => boolean;
}

const SCRIPT_EXTENSIONS = new Set(['.mjs', '.js', '.cjs']);

/**
 * Finds the sbx executable. Order: `binaryPath` option, `SBX_MOCK_PATH`, `SBX_PATH`, the Windows install
 * directory, then PATH. A configured candidate that does not exist is an error, never skipped, so a
 * typo cannot silently select a different sbx.
 */
export class SbxBinaryLocator {
	constructor(private readonly options: SbxBinaryLocatorOptions) {}

	locate(): SbxBinary {
		const configured = this.configuredCandidate();
		if (configured !== undefined) {
			if (!this.isFile(configured.path)) {
				throw new SandboxError(
					'binary-missing',
					`The sbx executable configured through ${configured.source} does not exist: "${configured.path}". ` +
						'Fix the path or remove the setting to use the default location.'
				);
			}
			return this.toBinary(configured.path);
		}

		const tried: string[] = [];
		const windowsDefault = this.windowsDefaultPath();
		if (windowsDefault !== undefined) {
			if (this.isFile(windowsDefault)) return this.toBinary(windowsDefault);
			tried.push(windowsDefault);
		}
		const onPath = this.searchPath(tried);
		if (onPath !== undefined) return this.toBinary(onPath);

		throw new SandboxError(
			'binary-missing',
			`The sbx executable (Docker Sandboxes) was not found. Looked in: ${tried.join(', ') || '(nothing to search)'}. ` +
				`Install sbx ${PINNED_SBX_VERSION} (${sbxReleaseUrl(PINNED_SBX_VERSION)}), then either add it to PATH, ` +
				'set the SBX_PATH environment variable to the executable, or pass the "binaryPath" option.'
		);
	}

	private configuredCandidate(): { source: string; path: string } | undefined {
		const { binaryPath, env } = this.options;
		if (binaryPath !== undefined && binaryPath !== '')
			return { source: 'the "binaryPath" option', path: binaryPath };
		const mock = env['SBX_MOCK_PATH'];
		if (mock !== undefined && mock !== '') return { source: 'SBX_MOCK_PATH', path: mock };
		const explicit = env['SBX_PATH'];
		if (explicit !== undefined && explicit !== '') return { source: 'SBX_PATH', path: explicit };
		return undefined;
	}

	private windowsDefaultPath(): string | undefined {
		if (this.options.platform !== 'win32') return undefined;
		const localAppData = this.options.env['LOCALAPPDATA'];
		if (localAppData === undefined || localAppData === '') return undefined;
		return path.win32.join(localAppData, 'DockerSandboxes', 'bin', 'sbx.exe');
	}

	private searchPath(tried: string[]): string | undefined {
		const { env, platform } = this.options;
		const pathApi = platform === 'win32' ? path.win32 : path.posix;
		const pathValue = env['PATH'] ?? env['Path'] ?? '';
		const names = platform === 'win32' ? ['sbx.exe', 'sbx.cmd', 'sbx.bat'] : ['sbx'];
		for (const directory of pathValue.split(pathApi.delimiter).filter(entry => entry !== '')) {
			for (const name of names) {
				const candidate = pathApi.join(directory, name);
				if (this.isFile(candidate)) return candidate;
			}
		}
		tried.push('PATH');
		return undefined;
	}

	private toBinary(filePath: string): SbxBinary {
		if (SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
			return { command: this.options.nodeExecutable, prefixArgs: [filePath], displayPath: filePath };
		}
		return { command: filePath, prefixArgs: [], displayPath: filePath };
	}

	private isFile(candidate: string): boolean {
		if (this.options.fileExists !== undefined) return this.options.fileExists(candidate);
		try {
			return fs.statSync(candidate).isFile();
		} catch {
			return false;
		}
	}
}

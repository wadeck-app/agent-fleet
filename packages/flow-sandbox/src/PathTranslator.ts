import { SandboxError } from './SandboxError';

/** A host or sandbox path that a step supplied inside env or script text and that is NOT translated. */
export interface PathWarning {
	/** `env NAME` or `script line N`. */
	location: string;
	match: string;
	message: string;
}

export interface PathTranslatorOptions {
	/** Host directory mounted as the workspace. */
	workspaceDir: string;
	/** Host directory mounted as the run's `.meta` (outputs, sessions). */
	workspaceMetaDir: string;
	/** `win32`: host paths are `C:\x` and appear as `/c/x` in the sandbox. Anything else: same path on both sides. */
	platform: NodeJS.Platform;
}

export interface HostExecutionPaths {
	workspaceDir: string;
	outputsDir: string;
	workspaceMetaDir: string;
	cwd?: string;
}

export interface SandboxExecutionPaths {
	workspaceDir: string;
	outputsDir: string;
	workspaceMetaDir: string;
	cwd?: string;
}

interface CanonicalPath {
	/** Lowercase drive letter on Windows, undefined for POSIX. */
	drive: string | undefined;
	segments: string[];
}

const WINDOWS_FORBIDDEN_CHARACTERS = /[<>:"|?*]/;

/** A segment Windows would not keep as written: forbidden or control characters, or a trailing dot or space. */
function isUnsafeWindowsSegment(segment: string): boolean {
	const hasControlCharacter = [...segment].some(character => character.charCodeAt(0) < 32);
	return hasControlCharacter || WINDOWS_FORBIDDEN_CHARACTERS.test(segment) || /[. ]$/.test(segment);
}
/** CON, PRN, AUX, NUL, COM1-9, LPT1-9, with or without an extension, any case: Windows opens a device, not a file. */
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

const WINDOWS_PATH_IN_TEXT = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s"'<>|;]*/g;
const UNC_PATH_IN_TEXT = /(?<![\\\w])\\\\[\w.$-]+\\[\w.$-]+[^\s"'<>|]*/g;

/**
 * Maps host paths to the paths the sandbox sees and back, and guarantees that every path stays inside the
 * two mounts: the run workspace and its `.meta` directory.
 *
 * "Canonical" here is lexical: duplicate separators, `.` and trailing separators are collapsed, a `..`
 * segment is REJECTED (never resolved), and no file system call is made, so no symlink is ever followed.
 * A symlink or junction that already exists inside a mount is therefore not detected; the mounts are
 * created by flow for one run, which is the assumption this relies on.
 *
 * Windows rules: only `C:\x` or `C:/x` forms are accepted (UNC, `\\?\`, drive-relative, other-drive and
 * relative paths are rejected), comparison ignores case, and the sandbox path is rebuilt from the mount's
 * own spelling so a differently cased input still names the file the sandbox sees.
 */
export class PathTranslator {
	private readonly windows: boolean;
	private readonly mounts: { name: string; host: CanonicalPath; hostSpelling: CanonicalPath }[];

	constructor(options: PathTranslatorOptions) {
		this.windows = options.platform === 'win32';
		const mounts = [
			{ name: 'workspaceDir', path: options.workspaceDir },
			{ name: 'workspaceMetaDir', path: options.workspaceMetaDir },
		];
		this.mounts = mounts.map(mount => {
			const canonical = this.canonicalHost(mount.path, mount.name);
			return { name: mount.name, host: this.lowered(canonical), hostSpelling: canonical };
		});
		const [workspace, meta] = this.mounts;
		if (
			workspace !== undefined &&
			meta !== undefined &&
			(this.isInside(workspace.host, meta.host) || this.isInside(meta.host, workspace.host))
		) {
			throw new SandboxError(
				'path-outside-mounts',
				`workspaceDir "${options.workspaceDir}" and workspaceMetaDir "${options.workspaceMetaDir}" must be two separate directories, ` +
					'neither inside the other: a path inside both could not be mapped to one mount.'
			);
		}
	}

	/** Host path to the path as seen inside the sandbox. */
	toSandbox(hostPath: string, label: string): string {
		const canonical = this.canonicalHost(hostPath, label);
		const lowered = this.lowered(canonical);
		for (const mount of this.mounts) {
			if (this.isInside(mount.host, lowered)) {
				const rest = canonical.segments.slice(mount.host.segments.length);
				return this.formatSandbox({
					drive: mount.hostSpelling.drive,
					segments: [...mount.hostSpelling.segments, ...rest],
				});
			}
		}
		throw this.outside(label, hostPath);
	}

	/** Sandbox path (for example one reported by a step) to the host path. */
	toHost(sandboxPath: string, label: string): string {
		const canonical = this.canonicalSandbox(sandboxPath, label);
		for (const mount of this.mounts) {
			if (this.isInside(mount.hostSpelling, canonical)) {
				const rest = canonical.segments.slice(mount.hostSpelling.segments.length);
				return this.formatHost({
					drive: mount.hostSpelling.drive,
					segments: [...mount.hostSpelling.segments, ...rest],
				});
			}
		}
		throw this.outside(label, sandboxPath);
	}

	/**
	 * Translates the four paths of an execution context. `workspaceDir` and `workspaceMetaDir` must be
	 * the configured mounts themselves, `outputsDir` and `cwd` anywhere inside a mount.
	 */
	translateExecutionContext(paths: HostExecutionPaths): SandboxExecutionPaths {
		this.requireMount(paths.workspaceDir, 'workspaceDir', 0);
		this.requireMount(paths.workspaceMetaDir, 'workspaceMetaDir', 1);
		const translated: SandboxExecutionPaths = {
			workspaceDir: this.toSandbox(paths.workspaceDir, 'workspaceDir'),
			outputsDir: this.toSandbox(paths.outputsDir, 'outputsDir'),
			workspaceMetaDir: this.toSandbox(paths.workspaceMetaDir, 'workspaceMetaDir'),
		};
		if (paths.cwd !== undefined) translated.cwd = this.toSandbox(paths.cwd, 'cwd');
		return translated;
	}

	/** Windows-looking paths in step env values. They are passed through untranslated: this only reports them. */
	findWindowsPathsInEnv(env: Readonly<Record<string, string>>): PathWarning[] {
		return Object.entries(env).flatMap(([name, value]) => this.scan(value, `env ${name}`));
	}

	/** Windows-looking paths in script text. They are passed through untranslated: this only reports them. */
	findWindowsPathsInScript(script: string): PathWarning[] {
		return script.split(/\r?\n/).flatMap((line, index) => this.scan(line, `script line ${index + 1}`));
	}

	private scan(text: string, location: string): PathWarning[] {
		const matches = [...(text.match(WINDOWS_PATH_IN_TEXT) ?? []), ...(text.match(UNC_PATH_IN_TEXT) ?? [])];
		return matches.map(match => ({
			location,
			match,
			message:
				`${location} contains the Windows path "${match}". Paths in env values and script text are NOT translated: ` +
				'inside the sandbox a file under the workspace is /c/... (lowercase drive letter, forward slashes). ' +
				'Use the sandbox form or the translated workspace variables.',
		}));
	}

	private requireMount(hostPath: string, label: string, mountIndex: number): void {
		const mount = this.mounts[mountIndex];
		const canonical = this.lowered(this.canonicalHost(hostPath, label));
		if (mount === undefined || !this.sameSegments(mount.host, canonical)) {
			throw new SandboxError(
				'path-outside-mounts',
				`${label} "${hostPath}" is not the mounted ${mount?.name ?? 'directory'}. The sandbox of this run only mounts ` +
					`${this.describeMounts()}.`
			);
		}
	}

	private canonicalHost(hostPath: string, label: string): CanonicalPath {
		if (typeof hostPath !== 'string' || hostPath === '') {
			throw this.invalid(label, String(hostPath), 'it is empty');
		}
		if (this.windows) return this.canonicalWindows(hostPath, label);
		if (!hostPath.startsWith('/')) throw this.invalid(label, hostPath, 'it is not an absolute path');
		return { drive: undefined, segments: this.segmentsOf(hostPath, /\//, label, hostPath) };
	}

	private canonicalWindows(hostPath: string, label: string): CanonicalPath {
		if (/^[\\/]{2}/.test(hostPath)) {
			throw this.invalid(label, hostPath, 'UNC and device paths (\\\\server\\share, \\\\?\\) cannot be mounted');
		}
		const match = /^([A-Za-z]):([\\/].*)$/.exec(hostPath);
		if (match?.[1] === undefined || match[2] === undefined) {
			throw this.invalid(
				label,
				hostPath,
				'only absolute drive-letter paths such as C:\\dir are supported (no relative or drive-relative paths)'
			);
		}
		const segments = this.segmentsOf(match[2], /[\\/]/, label, hostPath);
		for (const segment of segments) {
			if (isUnsafeWindowsSegment(segment)) {
				throw this.invalid(
					label,
					hostPath,
					`the segment "${segment}" has a character Windows treats specially (: < > " | ? * or a trailing dot or space)`
				);
			}
			if (WINDOWS_DEVICE_NAME.test(segment)) {
				throw this.invalid(
					label,
					hostPath,
					`the segment "${segment}" is a reserved Windows device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9)`
				);
			}
		}
		return { drive: match[1].toLowerCase(), segments };
	}

	private canonicalSandbox(sandboxPath: string, label: string): CanonicalPath {
		if (typeof sandboxPath !== 'string' || !sandboxPath.startsWith('/')) {
			throw this.invalid(label, String(sandboxPath), 'a sandbox path must be absolute (start with "/")');
		}
		if (sandboxPath.includes('\\')) {
			throw this.invalid(
				label,
				sandboxPath,
				'it contains a backslash, which would turn into a path separator on the host'
			);
		}
		const segments = this.segmentsOf(sandboxPath, /\//, label, sandboxPath);
		if (!this.windows) return { drive: undefined, segments };
		const [drive, ...rest] = segments;
		if (drive === undefined || !/^[a-z]$/.test(drive)) {
			throw this.invalid(
				label,
				sandboxPath,
				'a sandbox path on a Windows host starts with a lowercase drive letter such as /c/'
			);
		}
		for (const segment of rest) {
			if (isUnsafeWindowsSegment(segment)) {
				throw this.invalid(label, sandboxPath, `the segment "${segment}" cannot be a Windows file name`);
			}
			if (WINDOWS_DEVICE_NAME.test(segment)) {
				throw this.invalid(
					label,
					sandboxPath,
					`the segment "${segment}" is a reserved Windows device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9)`
				);
			}
		}
		return { drive, segments: rest };
	}

	private segmentsOf(path: string, separator: RegExp, label: string, original: string): string[] {
		const segments: string[] = [];
		for (const segment of path.split(separator)) {
			if (segment === '' || segment === '.') continue;
			if (segment === '..') {
				throw new SandboxError(
					'path-outside-mounts',
					`${label} "${original}" contains "..". Parent-directory segments are refused so that a path cannot leave the mounts: pass the resolved path.`
				);
			}
			if (/\0/.test(segment)) throw this.invalid(label, original, 'it contains a NUL character');
			segments.push(segment);
		}
		return segments;
	}

	private lowered(path: CanonicalPath): CanonicalPath {
		if (!this.windows) return path;
		return { drive: path.drive, segments: path.segments.map(segment => segment.toLowerCase()) };
	}

	private sameSegments(a: CanonicalPath, b: CanonicalPath): boolean {
		return a.drive === b.drive && a.segments.length === b.segments.length && this.isInside(a, b);
	}

	/** True when `inner` is `outer` or below it. Segments are compared as given: lower-case them first for a case-insensitive match. */
	private isInside(outer: CanonicalPath, inner: CanonicalPath): boolean {
		if (outer.drive !== inner.drive || inner.segments.length < outer.segments.length) return false;
		return outer.segments.every((segment, index) => segment === inner.segments[index]);
	}

	private formatSandbox(path: CanonicalPath): string {
		const parts = path.drive === undefined ? path.segments : [path.drive, ...path.segments];
		return `/${parts.join('/')}`;
	}

	private formatHost(path: CanonicalPath): string {
		if (path.drive === undefined) return `/${path.segments.join('/')}`;
		return `${path.drive.toUpperCase()}:\\${path.segments.join('\\')}`;
	}

	private describeMounts(): string {
		return this.mounts.map(mount => `${mount.name} (${this.formatHost(mount.hostSpelling)})`).join(' and ');
	}

	private outside(label: string, value: string): SandboxError {
		return new SandboxError(
			'path-outside-mounts',
			`${label} "${value}" is outside the sandbox mounts. The sandbox of this run only sees ${this.describeMounts()}; ` +
				'use a path inside one of them.'
		);
	}

	private invalid(label: string, value: string, reason: string): SandboxError {
		return new SandboxError('path-outside-mounts', `${label} "${value}" cannot be used: ${reason}.`);
	}
}

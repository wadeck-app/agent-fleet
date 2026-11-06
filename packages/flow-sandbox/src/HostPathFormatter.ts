import { SandboxError } from './SandboxError';

/**
 * Puts a host path in the form `sbx.exe` can open. On Windows sbx wants `C:\dir` (a Git Bash style
 * `/c/dir` makes `--env-file` and mounts fail), so `/c/dir` and `C:/dir` are converted. Anything that
 * is not a plain drive-letter path (relative, UNC, device path) is refused: those cannot be mounted
 * as the same path in the VM.
 */
export class HostPathFormatter {
	constructor(private readonly platform: NodeJS.Platform) {}

	toNative(hostPath: string, label: string): string {
		if (hostPath === '' || /[\0\r\n]/.test(hostPath)) {
			throw this.invalid(label, hostPath, 'it is empty or contains a control character');
		}
		if (this.platform !== 'win32') {
			if (!hostPath.startsWith('/')) {
				throw this.invalid(label, hostPath, 'it is not an absolute path');
			}
			return hostPath;
		}

		const drive = /^([A-Za-z]):([\\/].*)?$/.exec(hostPath);
		if (drive?.[1] !== undefined) {
			return this.windowsForm(drive[1], drive[2] ?? '\\');
		}
		const posixDrive = /^\/([A-Za-z])(\/.*)?$/.exec(hostPath);
		if (posixDrive?.[1] !== undefined) {
			return this.windowsForm(posixDrive[1], posixDrive[2] ?? '/');
		}
		throw this.invalid(
			label,
			hostPath,
			'it is not a drive-letter path such as C:\\dir (UNC and relative paths are refused)'
		);
	}

	private windowsForm(driveLetter: string, rest: string): string {
		const tail = rest.replace(/\//g, '\\');
		return `${driveLetter.toUpperCase()}:${tail}`;
	}

	private invalid(label: string, hostPath: string, reason: string): SandboxError {
		return new SandboxError(
			'invalid-argument',
			`${label} "${hostPath}" cannot be given to sbx: ${reason}. Pass an absolute local path on a drive letter.`
		);
	}
}

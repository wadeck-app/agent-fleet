import path from 'node:path';

/** Windows-style absolute path (`C:\x`, `C:/x`). */
export const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
/** UNC path (`\\server\share`). */
export const UNC = /^\\\\/;

/** The path syntax of a host: Windows (`C:\x`) or POSIX (`/x`). Every host-path decision takes it as a parameter so both can be tested on any host. */
export type PathFlavor = 'win32' | 'posix';

export function flavorOf(platform: NodeJS.Platform): PathFlavor {
	return platform === 'win32' ? 'win32' : 'posix';
}

export function pathModuleOf(flavor: PathFlavor): path.PlatformPath {
	return flavor === 'win32' ? path.win32 : path.posix;
}

/** True when the text is written with Windows path syntax (drive letter, UNC or a backslash), whatever host reads it. */
export function isWindowsSyntax(value: string): boolean {
	return WINDOWS_ABSOLUTE.test(value) || UNC.test(value) || value.includes('\\');
}

/** Last segment of a path, split by the syntax of the STRING (a `C:\x\y.cjs` read on a POSIX host is still `y.cjs`). */
export function basenameBySyntax(value: string): string {
	return (isWindowsSyntax(value) ? path.win32 : path.posix).basename(value);
}

/**
 * True when both name the same host file. On a Windows host: ignoring case and the kind of separator. On a POSIX host: exactly
 * (after normalising), because two paths that differ in case are two files there.
 */
export function sameHostPath(left: string, right: string, flavor: PathFlavor = flavorOf(process.platform)): boolean {
	if (flavor === 'win32') {
		const canonical = (value: string): string => path.posix.normalize(value.replaceAll('\\', '/')).toLowerCase();
		return canonical(left) === canonical(right);
	}
	return path.posix.normalize(left) === path.posix.normalize(right);
}

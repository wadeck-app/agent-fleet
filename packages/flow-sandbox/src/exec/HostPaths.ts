import path from 'node:path';

/** Windows-style absolute path (`C:\x`, `C:/x`). */
export const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
/** UNC path (`\\server\share`). */
export const UNC = /^\\\\/;

/** True when both name the same host file, ignoring case and the kind of separator (the host is Windows-first). */
export function sameHostPath(left: string, right: string): boolean {
	const canonical = (value: string): string => path.posix.normalize(value.replaceAll('\\', '/')).toLowerCase();
	return canonical(left) === canonical(right);
}

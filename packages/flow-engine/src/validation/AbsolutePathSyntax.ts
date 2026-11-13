/**
 * Host-independent, dependency-free check for an absolute path, usable in the browser (the flow editor runs the
 * validator there, where `node:path` is an empty module). A flow written on Windows can be validated on Linux and
 * the reverse, so both syntaxes are always recognised:
 * - POSIX root: `/x`
 * - Windows drive with a separator: `C:\x`, `C:/x` (`C:x` is drive-relative, so NOT absolute)
 * - UNC or `//` prefix: `\\server\share`, `//server/share`
 * - a lone leading backslash (`\x`) is rooted on the current drive: treated as absolute, because it ignores the
 *   workspace root exactly like `/x` does
 */
export class AbsolutePathSyntax {
	private static readonly ABSOLUTE = /^(?:[\\/]|[A-Za-z]:[\\/])/;

	static isAbsolute(value: unknown): value is string {
		return typeof value === 'string' && AbsolutePathSyntax.ABSOLUTE.test(value);
	}
}

/**
 * ===========================================================================================
 * PATH UTILITIES
 * ===========================================================================================
 *
 * Cross-platform path manipulation utilities.
 *
 * These utilities are designed to work with paths from any operating system
 * (Windows, Linux, macOS) regardless of the platform the frontend is running on.
 *
 * ===========================================================================================
 */

/**
 * Extracts the basename (last segment) from a file path.
 * Works with both Unix-style (/) and Windows-style (\) path separators.
 *
 * @param path - The file path to extract the basename from
 * @returns The basename (last segment) of the path, or the original path if no separator is found
 *
 * @example
 * getBasename('/home/user/project') // => 'project'
 * getBasename('C:\\Users\\user\\project') // => 'project'
 * getBasename('/home/user/project/') // => 'project'
 * getBasename('simple-path') // => 'simple-path'
 */
export function getBasename(path: string): string {
	// Handle empty string
	if (!path) {
		return path;
	}

	// Split by both forward slash and backslash, filter out empty strings
	const segments = path.split(/[/\\]/).filter(Boolean);

	// Return the last segment, or empty string if no segments found (path was only separators)
	return segments.length > 0 ? segments[segments.length - 1] : '';
}

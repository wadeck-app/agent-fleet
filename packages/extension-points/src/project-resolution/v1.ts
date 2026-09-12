/** Outcome of resolving the project a working directory belongs to. */
export interface ProjectResolution {
	/** Absolute path to the project root. */
	projectRoot: string;
	/**
	 * Human-readable description of the marker that identified the root, for
	 * diagnostics and error messages. Never branch on this value -- an
	 * implementation may use any marker it likes.
	 */
	via: string;
}

/**
 * Resolves which project a working directory belongs to.
 *
 * Implementations must fail loudly when no project root can be determined
 * rather than returning a fallback such as the working directory itself: a
 * wrongly-resolved root silently reads another project's configuration.
 */
export interface ProjectResolutionProvider {
	/**
	 * @param startDir - absolute path to begin the search from
	 * @returns the resolved project root
	 * @throws when no project root can be determined
	 */
	resolve(startDir: string): ProjectResolution;
}

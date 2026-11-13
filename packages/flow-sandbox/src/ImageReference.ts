/**
 * The image of a sandbox, as the package accepts it: `repository:tag` (registry and namespace allowed, a registry port allowed) or
 * `repository@digest`. A bare tag (`m6`) or a bare name is REFUSED, never completed: `sbx template ls` lists `<repository> <tag>`, the
 * image preflight matches both columns, and a reference without a tag can never match, so it would only fail later with a message that names
 * a build command for a tag that cannot be built. Why not normalise `m6` to `flow-sandbox:m6`: the repository name is the operator's, and a
 * silent guess would run another image than the one written in the configuration.
 *
 * plugin/plugin.config.js applies the same rule (it is plain JavaScript that imports nothing from this package); a test keeps the two equal.
 */
export class ImageReference {
	static readonly EXAMPLE = 'flow-sandbox:m6';

	/** Why the reference is not usable, or undefined when it is. */
	static problem(image: string): string | undefined {
		if (ImageReference.isTagged(image)) return undefined;
		return `the image ${JSON.stringify(image)} must be a repository:tag reference such as ${ImageReference.EXAMPLE} (the tag you gave to build-image.mjs --tag; \`sbx template ls\` lists them): without the repository and the ":" the sandbox image can never be found`;
	}

	static isTagged(image: string): boolean {
		if (image.includes('@')) {
			const [repository = '', digest = ''] = image.split('@');
			return repository !== '' && /^[a-z0-9]+:[A-Za-z0-9]+$/.test(digest);
		}
		const lastSegment = image.slice(image.lastIndexOf('/') + 1);
		const separator = lastSegment.indexOf(':');
		return separator > 0 && separator < lastSegment.length - 1;
	}
}

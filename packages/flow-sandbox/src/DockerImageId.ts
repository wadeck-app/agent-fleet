const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;

/** The id of a built image, and the check that the archive handed to `sbx template load` holds that very image. */
export class DockerImageId {
	/** From the output of `docker image inspect --format '{{.Id}}' <tag>`. Throws, with the output, if it is not an id. */
	static parse(inspectOutput: string): string {
		const id = inspectOutput.trim();
		if (!IMAGE_ID.test(id)) {
			throw new Error(
				`Expected an image id (sha256:<64 hex digits>) from \`docker image inspect\`, got ${JSON.stringify(inspectOutput.slice(0, 200))}.`
			);
		}
		return id;
	}

	/**
	 * `manifest.json` of a `docker save` archive lists, per image, its config blob (named after the image id) and its tags.
	 * Throws unless an entry has that id and that tag: the archive that is loaded must be the image that was built.
	 *
	 * Two layouts exist. Classic image store: the id is the digest of the config blob named by `Config`. containerd image store
	 * (Docker 29 in the sbx 0.51.0 builder): the id is the digest of the image index, listed by `index.json` of the archive, and
	 * `Config` is another digest. `indexJson` is the content of `index.json` (or the tar error when there is none).
	 */
	static assertInArchive(id: string, manifestJson: string, tag: string, indexJson?: string): void {
		const hex = id.replace('sha256:', '');
		let entries: unknown;
		try {
			entries = JSON.parse(manifestJson);
		} catch (error) {
			throw new Error(
				`The manifest.json of the saved image is not JSON: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		const indexHasId = DockerImageId.indexListsDigest(indexJson, id);
		const found =
			Array.isArray(entries) &&
			entries.some(
				(entry: { Config?: unknown; RepoTags?: unknown }) =>
					typeof entry.Config === 'string' &&
					(entry.Config.includes(hex) || indexHasId) &&
					Array.isArray(entry.RepoTags) &&
					entry.RepoTags.includes(tag)
			);
		if (!found) {
			throw new Error(
				`The saved archive does not hold image ${id} tagged ${tag} (manifest.json: ${manifestJson.slice(0, 300)}; index.json: ${(indexJson ?? 'not read').slice(0, 300)}). It was not loaded.`
			);
		}
	}

	private static indexListsDigest(indexJson: string | undefined, id: string): boolean {
		if (indexJson === undefined) return false;
		try {
			const index = JSON.parse(indexJson) as { manifests?: { digest?: unknown }[] };
			return Array.isArray(index.manifests) && index.manifests.some(manifest => manifest.digest === id);
		} catch {
			// Not JSON (the tar error of a classic archive): no index to rely on.
			return false;
		}
	}
}

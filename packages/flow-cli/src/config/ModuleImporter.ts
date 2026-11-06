import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Dynamic `import()` of a file by absolute path. Node reads the drive letter of a Windows path ("C:") as a URL scheme
 * and refuses it (ERR_UNSUPPORTED_ESM_URL_SCHEME), so the path always goes through a file URL.
 */
export class ModuleImporter {
	static toFileUrl(absolutePath: string): string {
		if (!isAbsolute(absolutePath)) {
			throw new Error(`Cannot import "${absolutePath}": the path must be absolute.`);
		}
		return pathToFileURL(absolutePath).href;
	}

	static async importFile(absolutePath: string): Promise<Record<string, unknown>> {
		const url = ModuleImporter.toFileUrl(absolutePath);
		// violations-suppress: ts/no-unsafe-type-cast a dynamically imported plugin module has no compile-time type; its exports are checked before use
		return (await import(url)) as Record<string, unknown>;
	}
}

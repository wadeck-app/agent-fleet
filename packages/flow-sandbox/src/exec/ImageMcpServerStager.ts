import fs from 'node:fs';
import path from 'node:path';

/**
 * Puts the engine's `mcp-server.cjs` where the sandbox image expects it (`<directory>/mcp-server.cjs`, unmodified: the
 * image runs the very file the engine ships). Shared by `scripts/BuildInnerBundles.mjs` (which builds image/opt-flow)
 * and the tests, so a test can produce the file it depends on instead of requiring a prior build.
 */
export class ImageMcpServerStager {
	constructor(private readonly flowCliDirectory: string) {}

	/** The engine's file, the single source of the image's copy. */
	get sourcePath(): string {
		return path.join(this.flowCliDirectory, 'src', 'worker', 'mcp-server.cjs');
	}

	/** Copies the file into `directory` (created if needed) and returns its path. Throws, with the source path, if the source is missing. */
	stageInto(directory: string): string {
		if (!fs.existsSync(this.sourcePath)) {
			throw new Error(
				`The engine's MCP server ${this.sourcePath} does not exist: the flow-cli package is incomplete or the layout changed (expected packages/flow-cli/src/worker/mcp-server.cjs).`
			);
		}
		fs.mkdirSync(directory, { recursive: true });
		const target = path.join(directory, 'mcp-server.cjs');
		fs.copyFileSync(this.sourcePath, target);
		return target;
	}
}

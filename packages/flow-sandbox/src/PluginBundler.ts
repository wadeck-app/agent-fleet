import { build } from 'esbuild';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ImageMcpServerStager } from './exec/ImageMcpServerStager';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface PluginArtifact {
	/** `<out>/plugin-sandbox`: the directory to give the daemon as `--plugins-dir` is its parent, `<out>`. */
	pluginDirectory: string;
	/** File name -> size in bytes. */
	files: Record<string, number>;
}

/**
 * Builds the sandbox plugin artifact (see plugin/plugin.config.js), the one thing a user needs on the daemon's machine:
 *   <out>/plugin-sandbox/plugin.config.js   the plugin (plain JS, copied as it is)
 *   <out>/plugin-sandbox/wrapper.cjs        the exec wrapper, engine and sandbox layer bundled (spawned with node)
 *   <out>/plugin-sandbox/mcp-server.cjs     flow's MCP server; the engine looks for it NEXT TO the bundle (McpServer.ts)
 * The esbuild options are those of flow-cli's bundle script and scripts/BuildInnerBundles.mjs; keep them equal, a difference
 * would mean the wrapper runs another engine than the one flow ships. Used by `npm run bundle` and by the tests.
 */
export class PluginBundler {
	async bundle(outDirectory: string): Promise<PluginArtifact> {
		const pluginDirectory = path.join(outDirectory, 'plugin-sandbox');
		mkdirSync(pluginDirectory, { recursive: true });
		const version = process.env['BUNDLE_VERSION'] ?? '0.0.0-sandbox-plugin';
		const requireFromHere = createRequire(import.meta.url);
		await build({
			entryPoints: [path.join(packageRoot, 'src', 'exec', 'WrapperBundleMain.ts')],
			outfile: path.join(pluginDirectory, 'wrapper.cjs'),
			bundle: true,
			platform: 'node',
			target: 'node22',
			format: 'cjs',
			external: [],
			supported: { 'top-level-await': false },
			define: { 'import.meta.url': '__importMetaUrl', __FLOW_CLI_VERSION__: JSON.stringify(version) },
			banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
			logLevel: 'warning',
			plugins: [
				{
					// createRequire-based requires are not traced by esbuild (copied from flow-cli's bundle script).
					name: 'inline-extension-points',
					setup(pluginBuild) {
						pluginBuild.onResolve({ filter: /extension-points\/extension-points\.json$/ }, () => ({
							path: requireFromHere.resolve('extension-points/extension-points.json'),
						}));
					},
				},
			],
		});
		copyFileSync(
			path.join(packageRoot, 'plugin', 'plugin.config.js'),
			path.join(pluginDirectory, 'plugin.config.js')
		);
		new ImageMcpServerStager(path.join(packageRoot, '..', 'flow-cli')).stageInto(pluginDirectory);

		const files: Record<string, number> = {};
		for (const name of ['plugin.config.js', 'wrapper.cjs', 'mcp-server.cjs']) {
			files[name] = statSync(path.join(pluginDirectory, name)).size;
		}
		return { pluginDirectory, files };
	}
}

import * as fs from 'fs';
import * as path from 'path';
import { type Plugin, defineConfig } from 'vitest/config';

const engineSrc = path.resolve(__dirname, '../flow-engine/src');
const sharedOrchWorkerSrc = path.resolve(__dirname, '../shared-orch-worker/src');

function resolveWorkspacePackages(): Plugin {
	return {
		name: 'resolve-workspace-packages',
		enforce: 'pre',
		resolveId(source) {
			if (source === 'flow-engine') {
				return path.join(engineSrc, 'index.ts');
			}
			if (source.startsWith('flow-engine/src/')) {
				const rel = source.slice('flow-engine/src/'.length).replace(/\.js$/, '');
				const tsPath = path.join(engineSrc, rel + '.ts');
				if (fs.existsSync(tsPath)) return tsPath;
			}
			if (source === 'shared-orch-worker/domain-types') {
				return path.join(sharedOrchWorkerSrc, 'domain-types.ts');
			}
			if (source.startsWith('shared-orch-worker/')) {
				const rel = source.slice('shared-orch-worker/'.length).replace(/\.js$/, '');
				const tsPath = path.join(sharedOrchWorkerSrc, rel + '.ts');
				if (fs.existsSync(tsPath)) return tsPath;
			}
			return null;
		},
	};
}

export default defineConfig({
	plugins: [resolveWorkspacePackages()],
	cacheDir: '.vitest-cache',
	test: {
		globals: true,
		environment: 'node',
		exclude: ['**/node_modules/**', '**/dist/**'],
	},
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
	},
	esbuild: {
		target: 'es2022',
	},
});

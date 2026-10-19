import * as fs from 'node:fs';
import * as path from 'node:path';
import { type Plugin, defineConfig } from 'vitest/config';

// Resolve relative .js imports to .ts/.tsx sources (flow-core and this package import TypeScript through .js specifiers).
function resolveJsToTs(): Plugin {
	return {
		name: 'resolve-js-to-ts',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;
			const base = path.resolve(path.dirname(importer), source.replace(/\.js$/, ''));
			for (const ext of ['.ts', '.tsx']) {
				if (fs.existsSync(base + ext)) return base + ext;
			}
			return null;
		},
	};
}

// Specific entry first: a plain 'flow-core' key would also capture 'flow-core/testing'.
const alias = {
	'flow-core/testing': path.resolve(__dirname, '../flow-core/src/testing/index.ts'),
	'flow-core': path.resolve(__dirname, '../flow-core/src/index.ts'),
};

// Two projects: the backend and the pure logic run in Node, the React components need a DOM.
export default defineConfig({
	plugins: [resolveJsToTs()],
	resolve: { alias },
	esbuild: { jsx: 'automatic' },
	test: {
		globals: true,
		restoreMocks: true,
		testTimeout: 30_000,
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['src/**/*.test.ts'],
				},
			},
			{
				extends: true,
				test: {
					name: 'dom',
					environment: 'jsdom',
					include: ['src/**/*.test.tsx'],
					setupFiles: ['./src/dsl-components/testing/TestSetup.ts'],
				},
			},
		],
	},
});

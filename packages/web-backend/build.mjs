import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ===========================================================================================
 * ESBUILD CONFIGURATION - WEB BACKEND
 * ===========================================================================================
 *
 * Current strategy: SINGLE BUNDLE
 * - Bundles everything into dist/server.js
 * - Dynamic imports (lazy controllers) are inlined but remain functional
 * - Best for: small number of controllers (2-5), long-running servers
 *
 * ===========================================================================================
 * SWITCHING TO CODE SPLITTING (for 10+ controllers or serverless)
 * ===========================================================================================
 *
 * When you need true lazy loading with separate chunks:
 *
 * 1. Change these options:
 *    - outfile: 'dist/server'  →  outdir: 'dist'
 *    - splitting: false           →  splitting: true
 *
 * 2. Result will be:
 *    dist/
 *    ├── server.js                          (main entry - small)
 *    ├── IngredientsController-ABC123.js    (loaded on demand)
 *    ├── BooksController-DEF456.js          (loaded on demand)
 *    └── chunk-SHARED789.js                 (shared code between chunks)
 *
 * 3. Benefits:
 *    - Faster cold start (main bundle is smaller)
 *    - True lazy loading (controllers loaded only when used)
 *    - Better caching (change one controller = one chunk invalidated)
 *
 * 4. Trade-offs:
 *    - Multiple files to deploy (but transparent)
 *    - Slightly more complex deployment
 *
 * ===========================================================================================
 */

const buildMode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const shouldMinify = buildMode === 'production';

console.log(`🔨 Building backend in ${buildMode} mode...`);

/**
 * Plugin to resolve TypeScript path aliases
 * Maps @/ to src/ and @app/shared to shared-frontend-backend package
 */
const aliasPlugin = {
	name: 'alias',
	setup(build) {
		// Resolve @/ to src/ (add .ts extension)
		build.onResolve({ filter: /^@\// }, args => {
			let importPath = args.path.replace(/^@\//, '');
			// Add .ts extension if not present
			if (!importPath.endsWith('.ts') && !importPath.endsWith('')) {
				importPath += '.ts';
			}
			return {
				path: path.resolve(__dirname, 'src', importPath),
			};
		});

		// Resolve @app/shared to shared-frontend-backend package
		build.onResolve({ filter: /^@app\/shared$/ }, () => {
			return {
				path: path.resolve(__dirname, '../shared-frontend-backend/src/index.ts'),
			};
		});
	},
};

try {
	const result = await esbuild.build({
		// ====================================================================
		// ENTRY & OUTPUT
		// ====================================================================

		entryPoints: ['src/server.ts'],

		// SINGLE BUNDLE mode (current)
		outfile: process.env.OUTFILE || 'dist/server',

		// CODE SPLITTING mode (uncomment to enable, comment outfile above)
		// outdir: 'dist',
		// splitting: true,

		// ====================================================================
		// PLATFORM & FORMAT
		// ====================================================================

		platform: 'node', // Target Node.js runtime
		target: 'node18', // Minimum Node.js version
		format: 'esm', // Use ES modules (import/export)

		// ====================================================================
		// PLUGINS
		// ====================================================================

		plugins: [aliasPlugin],

		// ====================================================================
		// BUNDLING & OPTIMIZATION
		// ====================================================================

		bundle: true, // Include all dependencies

		// Tree-shaking: remove unused exports
		treeShaking: true,

		// Minification: reduce file size (production only)
		minify: shouldMinify,

		// Source maps: for debugging
		sourcemap: true,

		// ====================================================================
		// EXTERNAL DEPENDENCIES
		// ====================================================================
		// Packages that should NOT be bundled (rare for backend)
		// Typically for native modules or when you want node_modules at runtime

		external: [
			// terminal-kit has non-JS files (README) that cause build issues
			'terminal-kit',
			// Monorepo packages - let Node.js resolve via package.json exports
			'shared-orch-worker',
			'shared-common',
		],

		// ====================================================================
		// METADATA & LOGGING
		// ====================================================================

		// Generate metafile for bundle analysis
		metafile: true,

		// Logging level
		logLevel: 'info',

		// ====================================================================
		// ADVANCED OPTIONS (uncomment if needed)
		// ====================================================================

		// Drop console.log in production
		// drop: shouldMinify ? ['console', 'debugger'] : [],

		// Define environment variables at build time
		// define: {
		//   'process.env.NODE_ENV': JSON.stringify(buildMode),
		// },

		// Legal comments (copyright notices)
		// legalComments: 'none',

		// Keep original function/class names (for profiling/debugging)
		// keepNames: true,

		// Loader configuration to handle non-JS files
		loader: {
			'.README': 'text',
			'.md': 'text',
		},
	});

	// ====================================================================
	// BUILD ANALYSIS
	// ====================================================================

	const { outputs } = result.metafile;
	const outputFiles = Object.entries(outputs);

	console.log('\n✅ Build successful!\n');
	console.log('📦 Output files:');

	let totalSize = 0;
	for (const [file, info] of outputFiles) {
		const sizeKB = (info.bytes / 1024).toFixed(2);
		totalSize += info.bytes;
		console.log(`   ${file.replace('dist/', '')} - ${sizeKB} KB`);
	}

	console.log(`\n📊 Total size: ${(totalSize / 1024).toFixed(2)} KB`);

	// ====================================================================
	// BUNDLE ANALYSIS (optional, for debugging)
	// ====================================================================
	// Uncomment to see what's taking space in your bundle:
	//
	// console.log('\n📈 Bundle composition:');
	// console.log(await esbuild.analyzeMetafile(result.metafile, {
	//   verbose: true,
	// }));

	process.exit(0);
} catch (error) {
	console.error('❌ Build failed:', error);
	process.exit(1);
}

/**
 * ===========================================================================================
 * BUILD SCRIPT - LIBRARY MODE
 * ===========================================================================================
 *
 * Builds orchestrator-adapters with orchestrator bundled for library mode.
 * This mode is used when the backend embeds the orchestrator in the same process.
 *
 * Features:
 * - Bundles orchestrator package (dynamic import resolved at build time)
 * - Defines ORCHESTRATOR_MODE='library' for conditional compilation
 * - External: shared-common, shared-orch-backend, ws
 * - Generates TypeScript declarations
 *
 * Usage: npm run build:library
 *
 * ===========================================================================================
 */
import { execSync } from 'child_process';
import esbuild from 'esbuild';

console.log('[build.library.mjs] Building orchestrator-adapters in library mode...');

try {
	// Build with esbuild
	await esbuild.build({
		entryPoints: ['src/index.ts'],
		bundle: true,
		outdir: 'dist',
		format: 'esm',
		platform: 'node',
		target: 'node18',
		// Keep these external (provided by consuming package)
		external: ['shared-common', 'shared-orch-backend', 'ws'],
		// orchestrator is NOT external - bundle it for library mode
		define: {
			'process.env.ORCHESTRATOR_MODE': '"library"',
		},
		sourcemap: true,
		minify: false,
		splitting: false,
	});

	console.log('[build.library.mjs] ✓ esbuild completed');

	// Generate TypeScript declarations
	console.log('[build.library.mjs] Generating TypeScript declarations...');
	execSync('tsc --emitDeclarationOnly --declaration', { stdio: 'inherit' });

	console.log('[build.library.mjs] ✅ Build completed successfully (library mode)');
} catch (error) {
	console.error('[build.library.mjs] ❌ Build failed:', error);
	process.exit(1);
}

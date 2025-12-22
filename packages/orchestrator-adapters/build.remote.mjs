/**
 * ===========================================================================================
 * BUILD SCRIPT - REMOTE MODE
 * ===========================================================================================
 *
 * Builds orchestrator-adapters with orchestrator externalized for remote mode.
 * This mode is used when the backend connects to a separate orchestrator-server.
 *
 * Features:
 * - Externalizes orchestrator package (not bundled)
 * - Defines ORCHESTRATOR_MODE='remote' for conditional compilation
 * - External: orchestrator, shared-common, shared-orch-backend, ws
 * - Generates TypeScript declarations
 *
 * Usage: npm run build:remote
 *
 * ===========================================================================================
 */
import { execSync } from 'child_process';
import esbuild from 'esbuild';

console.log('[build.remote.mjs] Building orchestrator-adapters in remote mode...');

try {
	// Build with esbuild
	await esbuild.build({
		entryPoints: ['src/index.ts'],
		bundle: true,
		outdir: 'dist',
		format: 'esm',
		platform: 'node',
		target: 'node18',
		// Keep these external (provided by consuming package or peer dependency)
		external: ['orchestrator', 'shared-common', 'shared-orch-backend', 'ws'],
		define: {
			'process.env.ORCHESTRATOR_MODE': '"remote"',
		},
		sourcemap: true,
		minify: false,
		splitting: false,
	});

	console.log('[build.remote.mjs] ✓ esbuild completed');

	// Generate TypeScript declarations
	console.log('[build.remote.mjs] Generating TypeScript declarations...');
	execSync('tsc --emitDeclarationOnly --declaration', { stdio: 'inherit' });

	console.log('[build.remote.mjs] ✅ Build completed successfully (remote mode)');
} catch (error) {
	console.error('[build.remote.mjs] ❌ Build failed:', error);
	process.exit(1);
}

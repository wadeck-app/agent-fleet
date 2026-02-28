import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Helper function to manually load .env files in order
// This ensures the root .env is loaded first, then local package .env overrides it
function loadEnvFiles(basePath: string, mode: string): Record<string, string> {
	const env: Record<string, string> = {};

	// Helper to parse .env file content
	const parseEnvFile = (content: string) => {
		const lines = content.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			// Skip comments and empty lines
			if (!trimmed || trimmed.startsWith('#')) continue;

			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match) {
				const key = match[1].trim();
				let value = match[2].trim();

				// Remove quotes if present
				if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1);
				}

				env[key] = value;
			}
		}
	};

	// Load root .env first (shared configuration for all packages)
	const rootEnvPath = path.join(basePath, '../../.env');
	if (fs.existsSync(rootEnvPath)) {
		const content = fs.readFileSync(rootEnvPath, 'utf-8');
		parseEnvFile(content);
	}

	// Load package .env (overrides root .env if same variables)
	const packageEnvPath = path.join(basePath, '.env');
	if (fs.existsSync(packageEnvPath)) {
		const content = fs.readFileSync(packageEnvPath, 'utf-8');
		parseEnvFile(content);
	}

	// Load mode-specific .env (e.g., .env.development, .env.production)
	const modeEnvPath = path.join(basePath, `.env.${mode}`);
	if (fs.existsSync(modeEnvPath)) {
		const content = fs.readFileSync(modeEnvPath, 'utf-8');
		parseEnvFile(content);
	}

	return env;
}

export default defineConfig(({ mode }) => {
	// Load env files with root .env loaded first
	const baseDir = process.cwd();
	const env = loadEnvFiles(baseDir, mode);

	// Calculate ports from PROJECT_ID for parallel development between projects
	// PROJECT_ID=0 → Frontend:5000, Backend:3000 | PROJECT_ID=1 → Frontend:5100, Backend:3100
	const projectId = parseInt(env.VITE_PROJECT_ID || env.PROJECT_ID || '0', 10);
	// Calculate ports from WORKSPACE_ID for parallel development between workspaces
	// WORKSPACE_ID=0 → Frontend:5000, Backend:3000 | WORKSPACE_ID=1 → Frontend:5010, Backend:3010
	const workspaceId = parseInt(env.VITE_WORKSPACE_ID || env.WORKSPACE_ID || '0', 10);
	const frontendPort = 5000 + projectId * 100 + workspaceId * 10;
	const backendPort = 3000 + projectId * 100 + workspaceId * 10;

	// Plugin to filter network addresses display
	function filterNetworkAddresses(backendApiUrl: string): Plugin {
		return {
			name: 'filter-network-addresses',
			configureServer(server) {
				// const originalPrintUrls = server.printUrls;
				server.printUrls = function () {
					// Get filtered network addresses (only 192.168.x.x)
					const interfaces = os.networkInterfaces();
					const addresses: string[] = [];

					for (const name of Object.keys(interfaces)) {
						const nets = interfaces[name];
						if (!nets) continue;

						for (const net of nets) {
							if (net.family === 'IPv4' && !net.internal) {
								if (net.address.startsWith('192.168.')) {
									addresses.push(net.address);
								}
							}
						}
					}

					// Print filtered URLs
					const protocol = server.config.server.https ? 'https' : 'http';
					const port = server.config.server.port || 5173;

					console.log(`\n  ➜  Local:   ${protocol}://localhost:${port}/`);
					addresses.forEach(address => {
						console.log(`  ➜  Network: ${protocol}://${address}:${port}/`);
					});
					console.log(`  ➜  Backend: ${backendApiUrl}`);
					console.log('  ➜  press h + enter to show help\n');
				};
			},
		};
	}

	// Calculate backend API URL
	const backendHost = env.VITE_API_HOST || 'localhost';
	const backendApiUrl = env.VITE_API_BASE_URL || `http://${backendHost}:${backendPort}/api`;

	return {
		plugins: [
			react({
				babel: {
					plugins: [['babel-plugin-react-compiler', { target: '19' }]],
				},
			}),
			tailwindcss(),
			filterNetworkAddresses(backendApiUrl),
		],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, './src'),
				'@framework': path.resolve(__dirname, './src/framework'),
				'@app': path.resolve(__dirname, './src/app'),
				'@transport': path.resolve(__dirname, './src/transport'),
				'@shared': path.resolve(__dirname, '../shared-frontend-backend/src'),
				// Monorepo package aliases (matching tsconfig.base.json paths)
				'flow-engine': path.resolve(__dirname, '../flow-engine/src'),
				'shared-orch-worker': path.resolve(__dirname, '../shared-orch-worker/src'),
				'shared-common': path.resolve(__dirname, '../shared-common/src'),
				'test-utils': path.resolve(__dirname, '../test-utils/src'),
			},
		},
		server: {
			// Expose on all network interfaces to allow access from other devices
			host: true,
			// port: process.env.VITE_E2E_PORT ? parseInt(process.env.VITE_E2E_PORT, 10) : 5173,
			port: frontendPort,
			//strictPort: !!process.env.VITE_E2E_PORT,
			proxy: {
				'/api': {
					target: `http://localhost:${backendPort}`,
					changeOrigin: true,
				},
			},
			// Explicitly allow serving files from workspace packages
			fs: {
				allow: [
					// Search up for workspace root
					path.resolve(__dirname, '../..'),
				],
			},
		},
		// Inject server-side env values (from root .env) into import.meta.env for browser use.
		// Standard Vite env loading only reads the package directory, not the monorepo root,
		// so PROJECT_ID and WORKSPACE_ID (defined in root .env) would otherwise be invisible
		// to the browser. This makes getApiBaseUrl() compute the correct backend port.
		define: {
			'import.meta.env.VITE_PROJECT_ID': JSON.stringify(String(projectId)),
			'import.meta.env.VITE_WORKSPACE_ID': JSON.stringify(String(workspaceId)),
		},
		// Don't optimize shared packages so they stay reactive to changes
		optimizeDeps: {
			exclude: ['@shared', 'shared-frontend-backend'],
		},
		test: {
			globals: true,
			environment: 'jsdom',
			setupFiles: './src/framework/tests/setup.ts',
			css: true,
			// Include test files only from src directory
			include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
			// Exclude dist and node_modules to prevent duplicate test execution
			exclude: ['dist/**', 'node_modules/**'],
			env: {
				// unit tests must mock the server!
				VITE_UNIT_TEST: true,
			},
			coverage: {
				provider: 'v8',
				reporter: ['text', 'json', 'html'],
				exclude: [
					'node_modules/',
					'src/framework/tests/',
					'**/*.d.ts',
					'**/*.config.*',
					'**/mockData',
					'dist/',
					'.storybook/',
					'src/app/main.tsx',
				],
				thresholds: {
					lines: 80,
					functions: 80,
					branches: 80,
					statements: 80,
				},
			},
		},
	};
});

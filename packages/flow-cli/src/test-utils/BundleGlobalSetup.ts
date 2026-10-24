import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const agentFleetRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const distBundle = resolve(agentFleetRoot, 'packages', 'flow-cli', 'dist-bundle');

/** Outputs the bundling tests execute; built here, removed again in teardown so no test bundle stays behind. */
const TEST_BUNDLES = ['flow.cjs', 'flow-updater.cjs'].map(name => resolve(distBundle, name));

/** The bundler refuses to run without a version (see ci/scripts/bundle.ts). */
const TEST_BUNDLE_VERSION = '0.0.0-test-bundling';

/**
 * Vitest globalSetup of the `bundling` project: builds dist/ and dist-bundle/ ONCE, before any test file runs.
 *
 * Each bundling test file used to rebuild in its own beforeAll. A rebuild rewrites dist/ (which the workspace
 * packages resolve to) and deletes dist-bundle/ files while other test processes are launching the CLI, so it was
 * a race against every parallel file, and the files raced each other too. Built once up front, nothing changes
 * on disk while tests run.
 */
export default function setup(): () => void {
	// `bundle` runs esbuild over dist/, so src must be compiled first or the bundle under test is whatever stale
	// dist/ happens to be on disk. shell: true so npm resolves (npm.cmd) on Windows.
	for (const script of ['build', 'bundle']) {
		execFileSync('npm', ['run', script, '--workspace', 'packages/flow-cli'], {
			windowsHide: true,
			cwd: agentFleetRoot,
			encoding: 'utf-8',
			timeout: 300_000,
			env: { ...process.env, BUNDLE_VERSION: TEST_BUNDLE_VERSION },
			shell: true,
		});
	}
	for (const bundle of TEST_BUNDLES) {
		if (!existsSync(bundle)) {
			throw new Error(
				`Bundling global setup: "npm run bundle" succeeded but did not produce "${bundle}". ` +
					'The bundling tests would prove nothing; check ci/scripts/bundle.ts outputs.'
			);
		}
	}
	return () => {
		for (const bundle of TEST_BUNDLES) rmSync(bundle, { force: true });
	};
}

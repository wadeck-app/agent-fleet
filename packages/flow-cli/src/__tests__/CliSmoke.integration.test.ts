/**
 * Does the CLI actually start?
 *
 * This exists because nothing else asks. `npm run check` type-checks, `npm run violations`
 * reads source, and every other suite imports modules through vitest's own resolver -- none
 * of them launch the binary a user launches. A real break got through all three: an import
 * of `shared-common/utils/getErrorMessage` type-checked while the package's `exports` map
 * had no runtime entry for it, so `flow worker --help` died with
 * ERR_PACKAGE_PATH_NOT_EXPORTED and every suite stayed green.
 *
 * Spawns `bin/flow.js`, not `FlowIndex.ts`, because the bin script does its own tsx
 * resolution and is what npm installs. Only commands that touch no daemon and write nothing
 * are used: `--help` alone imports the whole command graph, which is where a resolution or
 * module-level error surfaces.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const flowBin = resolve(__dirname, '..', '..', 'bin', 'flow.js');

/** Signs that the process died on the way up rather than answering. */
const STARTUP_FAILURES = [
	'ERR_PACKAGE_PATH_NOT_EXPORTED',
	'ERR_MODULE_NOT_FOUND',
	'ERR_INVALID_PACKAGE_CONFIG',
	'MODULE_NOT_FOUND',
	'Cannot find module',
	'SyntaxError',
	'cannot locate tsx',
];

function runFlow(args: string[]): { output: string; status: number | null } {
	// Fails loudly rather than skipping: a missing binary is the thing this test is for.
	if (!existsSync(flowBin)) throw new Error(`The flow binary is missing at "${flowBin}"`);

	// The test runner injects its own module loader through NODE_OPTIONS, and that loader
	// resolves specifiers a plain `node` refuses -- an exports map with no runtime entry
	// among them. Inheriting it would make this test agree with vitest instead of with the
	// user's shell, which is the opposite of the point.
	const env = { ...process.env };
	delete env['NODE_OPTIONS'];
	delete env['VITEST'];
	delete env['VITEST_WORKER_ID'];

	const result = spawnSync(process.execPath, [flowBin, ...args], {
		encoding: 'utf8',
		timeout: 60_000,
		env,
		// Deliberately not the package directory, which is where the test runner happens to
		// sit. Module resolution turned out to depend on the working directory: the same
		// command that worked from `packages/flow-cli` died from the repo root. Since a user
		// runs `flow` from their own project, anywhere but here is the honest cwd -- and it is
		// the only reason this test can see the failure at all.
		cwd: tmpdir(),
	});
	if (result.error) throw result.error;
	return { output: (result.stdout ?? '') + (result.stderr ?? ''), status: result.status };
}

function expectStarted(output: string): void {
	for (const marker of STARTUP_FAILURES) {
		expect(output, `the CLI failed during startup:\n${output}`).not.toContain(marker);
	}
}

describe('flow CLI starts', () => {
	it('prints its top-level help', () => {
		const { output, status } = runFlow(['--help']);

		expectStarted(output);
		expect(output).toContain('flow');
		expect(status).toBe(0);
	});

	it('prints its version', () => {
		const { output, status } = runFlow(['--version']);

		expectStarted(output);
		expect(output.trim()).not.toBe('');
		expect(status).toBe(0);
	});

	// One case per command group, so a module-level error in any of them is caught. Help is
	// enough: reaching it means the whole import graph for that group loaded.
	it.each([['run'], ['worker'], ['worker', 'start'], ['worker', 'source'], ['history'], ['logs']])(
		'prints help for "%s"',
		(...command: string[]) => {
			const { output, status } = runFlow([...command, '--help']);

			expectStarted(output);
			expect(status).toBe(0);
		}
	);

	// A CLI that answers an unknown command has finished starting up, and the wording is
	// itself a UX contract (no silent exit).
	it('rejects an unknown command with an actionable line', () => {
		const { output, status } = runFlow(['totally-unknown-xyz']);

		expectStarted(output);
		expect(output).toContain('Unknown command: totally-unknown-xyz');
		expect(status).toBe(1);
	});
});

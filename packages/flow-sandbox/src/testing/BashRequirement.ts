import { spawnSync } from 'node:child_process';

/**
 * Some tests run a REAL `bash` (the credential script and the glue installer are bash scripts). There is no skip: a
 * machine without bash must fail these tests and say why. Call it from a top-level `beforeAll` of every test file
 * that spawns bash.
 */
export class BashRequirement {
	static assertAvailable(): void {
		const probe = spawnSync('bash', ['-c', 'exit 0'], { encoding: 'utf8' });
		if (probe.error || probe.status !== 0) {
			const reason = probe.error
				? probe.error.message
				: `exit code ${String(probe.status)}: ${probe.stderr.trim()}`;
			throw new Error(
				`These tests need bash on PATH (Git for Windows on Windows: install it and put its "bin" or "usr/bin" directory on PATH). Running \`bash -c "exit 0"\` failed: ${reason}`
			);
		}
	}
}

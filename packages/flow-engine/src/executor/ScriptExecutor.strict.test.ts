/**
 * Strict mode (bash -e -u) of script steps: command construction on every bash path and real
 * bash behaviour. The real-bash block fails loudly (by name) when bash cannot be resolved,
 * instead of skipping silently.
 */
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, StepTrace } from '../types';
import { ScriptExecutor } from './ScriptExecutor';
import type { ScriptExecutionOptions } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';
import { BashShellStrategy } from './shell/BashShellStrategy';

vi.mock('child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('child_process')>();
	return { ...actual };
});

function makeMockChild() {
	const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = vi.fn();
	return child;
}

describe('ScriptExecutor strict mode - command construction (spawn mocked)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function spawnArgs(options: ScriptExecutionOptions): Promise<string[]> {
		const child = makeMockChild();
		const spy = vi.spyOn(child_process, 'spawn').mockReturnValue(child as unknown as child_process.ChildProcess);
		vi.spyOn(BashShellStrategy.prototype, 'resolve').mockReturnValue('/usr/bin/bash');
		const promise = new ScriptExecutor().execute(options);
		setImmediate(() => child.emit('close', 0));
		await promise;
		return spy.mock.calls[0][1] as string[];
	}

	it('shellKind bash, single line: -e -u before the temp file by default', async () => {
		const args = await spawnArgs({ script: 'echo hi', shellKind: 'bash' });
		expect(args.slice(0, 2)).toEqual(['-e', '-u']);
		expect(args).toHaveLength(3);
		expect(args[2]).toMatch(/agent-fleet-script-.*\.sh$/);
	});

	it('shellKind bash, multi-line: -e -u before the temp file by default', async () => {
		const args = await spawnArgs({ script: 'false\necho after', shellKind: 'bash' });
		expect(args.slice(0, 2)).toEqual(['-e', '-u']);
		expect(args).toHaveLength(3);
	});

	it('shellKind bash with strict: false: only the temp file', async () => {
		const args = await spawnArgs({ script: 'false\necho after', shellKind: 'bash', strict: false });
		expect(args).toHaveLength(1);
		expect(args[0]).toMatch(/\.sh$/);
	});

	it('shellKind cmd and pwsh never get bash flags, whatever strict says', async () => {
		vi.spyOn(child_process, 'spawn');
		const cmdChild = makeMockChild();
		const spy = vi.spyOn(child_process, 'spawn').mockReturnValue(cmdChild as unknown as child_process.ChildProcess);
		const { CmdShellStrategy } = await import('./shell/CmdShellStrategy');
		vi.spyOn(CmdShellStrategy.prototype, 'resolve').mockReturnValue('cmd.exe');
		const promise = new ScriptExecutor().execute({ script: 'echo hi', shellKind: 'cmd', strict: true });
		setImmediate(() => cmdChild.emit('close', 0));
		await promise;
		expect(spy.mock.calls[0][1]).toEqual(['/d', '/c', expect.stringMatching(/\.bat$/)]);
	});

	// The implicit multi-line bash path only exists on Windows
	it.runIf(process.platform === 'win32')('implicit Windows multi-line bash: -e -u by default', async () => {
		const args = await spawnArgs({ script: 'false\necho after' });
		expect(args.slice(0, 2)).toEqual(['-e', '-u']);
	});

	it.runIf(process.platform === 'win32')('implicit Windows multi-line bash, strict: false', async () => {
		const args = await spawnArgs({ script: 'false\necho after', strict: false });
		expect(args).toHaveLength(1);
	});
});

describe('ScriptExecutor strict mode - real bash', () => {
	let bashPath: string | null = null;
	let bashError: string | null = null;
	try {
		bashPath = new BashShellStrategy().resolve(process.env);
	} catch (e) {
		bashError = (e as Error).message;
	}

	it('bash is available for the strict-mode tests (fails loudly otherwise)', () => {
		if (bashError) throw new Error(`strict-mode tests need bash: ${bashError}`);
		expect(bashPath).toBeTruthy();
	});

	const executor = new ScriptExecutor();
	const run = (script: string, extra: Partial<ScriptExecutionOptions> = {}) =>
		executor.execute({ script, shellKind: 'bash', isolateEnv: false, ...extra });

	it('a failing command mid-script fails the step by default', async () => {
		const result = await run('false\necho after');
		expect(result.exitCode).toBe(1);
		expect(result.success).toBe(false);
		expect(result.stdout).not.toContain('after');
		expect(result.strictApplied).toBe(true);
	});

	it('strict: false restores the old behaviour (last command decides)', async () => {
		const result = await run('false\necho after', { strict: false });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('after');
		expect(result.strictApplied).toBe(false);
	});

	it('an unset variable fails under nounset', async () => {
		const result = await run('echo "v=$DEFINITELY_UNSET_VAR_XYZ"');
		expect(result.success).toBe(false);
		expect(result.stderr).toContain('DEFINITELY_UNSET_VAR_XYZ');
	});

	it('single-line `false; echo after` also fails', async () => {
		const result = await run('false; echo after');
		expect(result.success).toBe(false);
	});

	it('pipefail is NOT enabled by default (a failing left side of a pipeline is masked), opt-in via set -o pipefail', async () => {
		const masked = await run('false | cat\necho after');
		expect(masked.success).toBe(true);
		const optedIn = await run('set -o pipefail\nfalse | cat\necho after');
		expect(optedIn.success).toBe(false);
	});

	it('user `set +e` inside the script still works', async () => {
		const result = await run('set +e\nfalse\necho after');
		expect(result.success).toBe(true);
		expect(result.stdout).toBe('after');
	});

	it('heredocs work and `|| true` / `if` guards are honoured', async () => {
		const result = await run('cat <<EOF\nline $((1+1))\nEOF\nfalse || true\nif false; then echo no; fi\necho done');
		expect(result.success).toBe(true);
		expect(result.stdout).toBe('line 2\ndone');
	});

	it('a script already starting with `set -eu` behaves identically in both modes', async () => {
		const script = 'set -eu\nfalse\necho after';
		const strict = await run(script);
		const loose = await run(script, { strict: false });
		expect([strict.exitCode, strict.stdout]).toEqual([loose.exitCode, loose.stdout]);
		expect(strict.exitCode).toBe(1);
	});

	it('error line numbers are not shifted by the strict flags', async () => {
		const result = await run('echo one\necho "$UNSET_LINE2_VAR"');
		expect(result.stderr).toMatch(/line 2: UNSET_LINE2_VAR: unbound variable/);
	});
});

describe('script step end-to-end (ScriptExecutor + executeScriptStep, real bash)', () => {
	const services = {
		templateRenderer: { render: (s: string) => s } as unknown as TemplateRenderer,
		scriptExecutor: new ScriptExecutor(),
		outputExtractor: { extract: () => ({}) } as unknown as OutputExtractor,
	};
	const exec = (script: string, extra: Record<string, unknown> = {}) =>
		executeScriptStep(
			{ id: 's1', name: 'S1', type: 'script', script, shell: 'bash', ...extra } as unknown as ScriptFlowStep,
			process.cwd(),
			{ inputs: {}, stepOutputs: new Map() },
			{ stepId: 's1' } as StepTrace,
			services
		);

	it('`false` then `echo after` => failed with the exit code and the strict hint', async () => {
		const trace = await exec('false\necho after');
		expect(trace.error).toContain('Script exited with code 1');
		expect(trace.error).toContain('strict mode (set -eu)');
		expect(trace.error).toContain('strict: false');
	});

	it('strict: false => completed, no error', async () => {
		const trace = await exec('false\necho after', { strict: false });
		expect(trace.error).toBeUndefined();
		expect(trace.stdout).toBe('after');
	});

	it('`echo $UNSET_VAR` => failed under nounset', async () => {
		const trace = await exec('echo $E2E_UNSET_VAR');
		expect(trace.error).toContain('Script exited with code');
		expect(trace.stderr).toContain('E2E_UNSET_VAR');
	});

	it('a non-strict failing step has no strict hint', async () => {
		const trace = await exec('exit 3', { strict: false });
		expect(trace.error).toBe('Script exited with code 3');
	});
});

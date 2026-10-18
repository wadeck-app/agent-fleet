/**
 * Full failure message of a script step killed by a Windows NTSTATUS, with spawn mocked.
 * Real incident: "Script exited with code 3221225794" (0xC0000142) when bash.exe could not start.
 */
import * as child_process from 'child_process';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, StepTrace } from '../types';
import { PROCESS_COUNT_COMMAND } from './NtStatusDescriber';
import { ScriptExecutor } from './ScriptExecutor';
import { ScriptFailureMessageBuilder } from './ScriptFailureMessageBuilder';
import { executeScriptStep } from './ScriptStepExecutor';
import { BashInvocation } from './shell/BashInvocation';
import { BashShellStrategy } from './shell/BashShellStrategy';

vi.mock('child_process');

function makeMockChild() {
	const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = vi.fn();
	return child;
}

function run(exitCode: number, builder: ScriptFailureMessageBuilder) {
	const child = makeMockChild();
	vi.spyOn(child_process, 'spawn').mockReturnValue(child as unknown as child_process.ChildProcess);
	vi.spyOn(BashShellStrategy.prototype, 'resolve').mockReturnValue('C:\\Git\\usr\\bin\\bash.exe');
	const step = {
		id: 's1',
		name: 'S1',
		type: 'script',
		script: 'echo hi',
		shell: 'bash',
	} as unknown as ScriptFlowStep;
	const trace = { stepId: 's1' } as StepTrace;
	const promise = executeScriptStep(
		step,
		'C:\\workspace',
		{ inputs: {}, stepOutputs: new Map() },
		trace,
		{
			templateRenderer: { render: (s: string) => s } as unknown as TemplateRenderer,
			scriptExecutor: new ScriptExecutor(),
			outputExtractor: { extract: () => ({}) } as unknown as OutputExtractor,
		},
		builder
	);
	// Let execute() reach spawn before closing the child
	setImmediate(() => child.emit('close', exitCode));
	return promise;
}

describe('script step failure message (spawn mocked)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('0xC0000142 on Windows: hex, name, shell path, cwd, hint and process counts', async () => {
		const counter = {
			count: vi
				.fn()
				.mockResolvedValue({ ok: true, counts: { 'bash.exe': 135, 'conhost.exe': 114, 'node.exe': 9 } }),
		};
		const trace = await run(3221225794, new ScriptFailureMessageBuilder('win32', counter));
		expect(trace.exitCode).toBe(3221225794);
		expect(trace.error).toContain('Script exited with code 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)');
		expect(trace.error).toContain('Shell: C:\\Git\\usr\\bin\\bash.exe');
		expect(trace.error).toContain('Cwd: C:\\workspace');
		expect(trace.error).toContain(PROCESS_COUNT_COMMAND);
		expect(trace.error).toContain('Process counts: bash.exe=135, conhost.exe=114, node.exe=9');
	});

	it("exit code 1 keeps today's exact message", async () => {
		const trace = await run(1, new ScriptFailureMessageBuilder('win32', { count: vi.fn() }));
		// Historical first line is unchanged; bash steps are strict by default so the opt-out hint follows
		expect(trace.error).toBe(`Script exited with code 1\n${BashInvocation.STRICT_FAILURE_HINT}`);
	});

	it("non-Windows keeps today's exact message for the same raw code", async () => {
		const trace = await run(3221225794, new ScriptFailureMessageBuilder('linux', { count: vi.fn() }));
		expect(trace.error).toBe(`Script exited with code 3221225794\n${BashInvocation.STRICT_FAILURE_HINT}`);
	});

	it('success leaves error unset', async () => {
		const trace = await run(0, new ScriptFailureMessageBuilder('win32', { count: vi.fn() }));
		expect(trace.error).toBeUndefined();
	});
});

describe('executeOrThrow (spawn mocked)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function failWith(exitCode: number) {
		const child = makeMockChild();
		vi.spyOn(child_process, 'spawn').mockReturnValue(child as unknown as child_process.ChildProcess);
		vi.spyOn(BashShellStrategy.prototype, 'resolve').mockReturnValue('C:\\Git\\usr\\bin\\bash.exe');
		const promise = new ScriptExecutor().executeOrThrow({ script: 'echo hi', shellKind: 'bash' });
		setImmediate(() => child.emit('close', exitCode));
		return promise;
	}

	it('renders an NTSTATUS exit as hex, name and hint', async () => {
		await expect(failWith(3221225794)).rejects.toThrow(
			/Script failed with exit code 0xC0000142 STATUS_DLL_INIT_FAILED: .*leaked bash\.exe/
		);
	});

	it('keeps a plain exit code as is', async () => {
		await expect(failWith(3)).rejects.toThrow('Script failed with exit code 3');
	});
});

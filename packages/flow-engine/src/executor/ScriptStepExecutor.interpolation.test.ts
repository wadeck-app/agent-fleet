/**
 * Characterization of a security-relevant contract: `${{ ... }}` in a script body is RAW text substitution,
 * the shell then parses the result. A value with shell syntax is executed; the same value passed through
 * `env:` arrives intact. `flow validate` flags the first pattern (SCRIPT_BODY_INTERPOLATION).
 * Harmless payloads only: the "attack" writes a marker file inside a temp dir created by the test.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, StepTrace } from '../types';
import { ScriptExecutor } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';

let dir: string;

beforeAll(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'script-interpolation-'));
});

afterAll(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

function posix(p: string): string {
	return p.replace(/\\/g, '/');
}

async function run(step: Record<string, unknown>, task: string): Promise<StepTrace> {
	const services = {
		templateRenderer: new TemplateRenderer(),
		scriptExecutor: new ScriptExecutor(),
		outputExtractor: { extract: () => ({}) } as unknown as OutputExtractor,
	};
	return executeScriptStep(
		{ id: 'call', name: 'Call', type: 'script', shell: 'bash', ...step } as unknown as ScriptFlowStep,
		dir,
		{ inputs: { task }, stepOutputs: new Map(), taskMetadata: {} } as TemplateContext,
		{ stepId: 'call' } as StepTrace,
		services
	);
}

describe('script body interpolation reaches the shell unescaped', () => {
	it('executes a command substitution carried by an input', async () => {
		const marker = posix(path.join(dir, 'executed.marker'));
		const trace = await run({ script: 'echo "task: ${{ inputs.task }}"' }, `$(touch ${marker})`);
		expect(trace.script).toContain(`$(touch ${marker})`);
		expect(fs.existsSync(marker)).toBe(true);
	});

	it('executes backticks carried by an input', async () => {
		const marker = posix(path.join(dir, 'backtick.marker'));
		await run({ script: 'echo "${{ inputs.task }}"' }, `\`touch ${marker}\``);
		expect(fs.existsSync(marker)).toBe(true);
	});

	it('loses double quotes and splits on ; (the value is parsed as shell code)', async () => {
		const trace = await run({ script: 'echo ${{ inputs.task }}' }, 'say "hi"; echo second');
		expect(trace.stdout).not.toContain('"');
		expect(trace.stdout).toContain('second');
	});

	it('keeps the same payload intact when passed through env:', async () => {
		const marker = posix(path.join(dir, 'env.marker'));
		const payload = `$(touch ${marker}) \`x\` "q" 'a'; echo b`;
		const trace = await run({ script: 'printf "%s" "$TASK"', env: { TASK: '${{ inputs.task }}' } }, payload);
		expect(trace.stdout).toBe(payload);
		expect(fs.existsSync(marker)).toBe(false);
	});
});

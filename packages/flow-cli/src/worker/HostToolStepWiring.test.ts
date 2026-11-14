import type { HostTool } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HostToolExecutableError } from './HostToolExecutableResolver';
import { HostToolStepWiring } from './HostToolStepWiring';

const tool = (overrides: Partial<HostTool> = {}): HostTool => ({
	id: 'show',
	description: 'd',
	sideEffect: 'read',
	command: [process.execPath, '-v'],
	...overrides,
});

describe('HostToolStepWiring.prepare', () => {
	let workspace: string;
	beforeAll(() => {
		workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-wiring-'));
	});
	afterAll(() => {
		fs.rmSync(workspace, { recursive: true, force: true });
	});

	const prepare = (hostTools: HostTool[] | undefined, lines: string[] = []) =>
		HostToolStepWiring.prepare({
			stepId: 'triage',
			hostTools,
			workspaceDir: workspace,
			workerEnvironment: process.env,
			writeAuditLine: line => lines.push(line),
		});

	it.each([[undefined], [[]]])('returns nothing for a step without tools (%j)', hostTools => {
		expect(prepare(hostTools as HostTool[] | undefined)).toBeUndefined();
	});

	it('returns the serving for McpServer: step id, the tools and a working handler', async () => {
		const lines: string[] = [];
		const serving = prepare([tool()], lines)!;
		expect(serving.stepId).toBe('triage');
		expect(serving.tools).toHaveLength(1);
		const reply = await serving.handler.call({ executionId: 'e', callId: 'c', toolId: 'show', args: { nope: 1 } });
		expect(reply.ok).toBe(false);
		expect(lines).toHaveLength(1);
	});

	it('fails with a named error, before anything starts, when an executable cannot be resolved', () => {
		const attempt = (): unknown => prepare([tool({ command: ['definitely-not-installed-xyz'] })]);
		expect(attempt).toThrow(HostToolExecutableError);
		expect(attempt).toThrow(/Step 'triage' tool 'show'.*definitely-not-installed-xyz/);
	});

	it.each([['FLOW_WORKER_TOKEN'], ['flow_mcp_tool_token']])(
		'fails loudly when a tool declares the forbidden env name %s',
		name => {
			expect(() => prepare([tool({ env: [name] })])).toThrow(
				new RegExp(
					`Step 'triage' tool 'show': env name '${name}' is never passed to host tools.*Fix: remove it`
				)
			);
		}
	);
});

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
			// An absolute-only PATH: the ambient one may hold relative entries, which resolution refuses.
			workerEnvironment: { ...process.env, PATH: path.dirname(process.execPath) },
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
		const reply = await serving.handler.call(
			{ executionId: 'e', callId: 'c', toolId: 'show', args: { nope: 1 } },
			new AbortController().signal
		);
		expect(reply.ok).toBe(false);
		expect(lines).toHaveLength(1);
	});

	it('fails with a named error, before anything starts, when an executable cannot be resolved', () => {
		const attempt = (): unknown => prepare([tool({ command: ['definitely-not-installed-xyz'] })]);
		expect(attempt).toThrow(HostToolExecutableError);
		expect(attempt).toThrow(/Step 'triage' tool 'show'.*definitely-not-installed-xyz/);
	});

	describe('executable inside the workspace (F-16 residual)', () => {
		/** A runnable file (it is never run here) at `directory/name`. */
		const plant = (directory: string, name: string): string => {
			fs.mkdirSync(directory, { recursive: true });
			const file = path.join(directory, name);
			fs.writeFileSync(file, 'x');
			fs.chmodSync(file, 0o755);
			return file;
		};
		const warnings = (lines: string[]): string[] => lines.filter(line => line.includes('WARNING'));

		it('warns once per such tool at step start: tool id, path, why, Fix; the step still starts', () => {
			const inside = plant(path.join(workspace, 'bin'), 'local-tool.exe');
			const outside = plant(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-outside-')), 'other-tool.exe');
			const lines: string[] = [];
			const serving = prepare(
				[
					tool({ id: 'local', command: [inside] }),
					tool({ id: 'elsewhere', command: [outside] }),
					tool({ id: 'local-again', command: [inside, 'x'] }),
				],
				lines
			);
			expect(serving).toBeDefined();
			const found = warnings(lines);
			expect(found).toHaveLength(2);
			expect(found[0]).toContain("tool 'local'");
			expect(found[0]).toContain(inside);
			expect(found[0]).toMatch(/model can write the workspace/);
			expect(found[0]).toMatch(/Fix: use an executable outside the workspace\./);
			expect(found[1]).toContain("tool 'local-again'");
			expect(found.join('\n')).not.toContain("tool 'elsewhere'");
			// Nothing is written per call or at construction beyond the warnings.
			expect(lines).toEqual(found);
		});

		it('writes no warning for an executable outside the workspace', () => {
			const lines: string[] = [];
			prepare([tool()], lines);
			expect(lines).toEqual([]);
		});
	});

	describe('relative or empty PATH entries are ignored and reported once per step', () => {
		const nodeName = path.basename(process.execPath);
		const bareNodeTool = (id: string): HostTool => tool({ id, command: [nodeName] });
		const withPath = (entries: string[], hostTools: HostTool[], lines: string[]) =>
			HostToolStepWiring.prepare({
				stepId: 'triage',
				hostTools,
				workspaceDir: workspace,
				workerEnvironment: { ...process.env, PATH: entries.join(path.delimiter) },
				writeAuditLine: line => lines.push(line),
			});
		const notices = (lines: string[]): string[] => lines.filter(line => line.includes('ignored'));
		const absoluteEntry = path.dirname(process.execPath);

		it('writes ONE sanitised, length-capped line for several bare-name tools, then resolves normally', () => {
			const lines: string[] = [];
			const long = 'x'.repeat(500);
			const serving = withPath(
				['C', absoluteEntry, 'C\u001b[31m', long, ''],
				[bareNodeTool('one'), bareNodeTool('two')],
				lines
			);
			expect(serving).toBeDefined();
			const found = notices(lines);
			expect(found).toHaveLength(1);
			expect(found[0]).toMatch(/^\[host-tool\] NOTICE Step 'triage': .*'C'/);
			expect(found[0]).toContain('C?[31m');
			expect(found[0]).not.toContain('\u001b');
			expect(found[0]).not.toContain('x'.repeat(100));
			expect(found[0]).toContain('(empty)');
			expect(found[0]).toMatch(/Fix: /);
			expect(lines).toEqual(found);
		});

		it.each([
			['an absolute command', () => [tool()], ['C', absoluteEntry]],
			['no ignored entry', () => [bareNodeTool('one')], [absoluteEntry]],
		])('writes no line for %s', (_label, makeTools, entries) => {
			const lines: string[] = [];
			withPath(entries, makeTools(), lines);
			expect(lines).toEqual([]);
		});

		it('keeps the named not-found error for a command that is nowhere, and still logs the ignored entries first', () => {
			const lines: string[] = [];
			const attempt = (): unknown => withPath(['C', absoluteEntry], [tool({ command: ['nope-xyz'] })], lines);
			expect(attempt).toThrow(/Step 'triage' tool 'show': executable 'nope-xyz' was not found/);
			expect(notices(lines)).toHaveLength(1);
		});
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

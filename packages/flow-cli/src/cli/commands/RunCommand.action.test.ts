/**
 * Characterization of the `flow run` action: exit codes, messages and output formats, with the daemon
 * client faked and the flow config directory pointed at a throwaway directory.
 */
import { Command } from 'commander';
import { executionsDirOf, logFilePath, todayLogDate } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionStore } from '../../storage/ExecutionStore';
import { registerRunCommand } from './RunCommand.js';

const harness = vi.hoisted(() => ({
	dir: '',
	send: vi.fn(),
}));

vi.mock('flow-core', async importOriginal => {
	const original = await importOriginal<typeof import('flow-core')>();
	return { ...original, createRemoteDaemonClient: () => ({ send: harness.send }) };
});

vi.mock('../../config/FlowConfigDir.js', () => ({ flowConfigDir: () => harness.dir }));

class ExitSignal extends Error {
	constructor(readonly code: number | undefined) {
		super(`exit ${code}`);
	}
}

let tmpDir: string;
let flowFile: string;
let errors: string[];
let logs: string[];
let stdout: string[];
let stderr: string[];

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-action-test-'));
	harness.dir = path.join(tmpDir, 'cfg');
	fs.mkdirSync(harness.dir, { recursive: true });
	flowFile = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(flowFile, 'steps:\n  - id: first\n    log: streaming\n  - id: second\n');
	harness.send.mockReset();
	errors = [];
	logs = [];
	stdout = [];
	stderr = [];
	vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
		errors.push(a.map(String).join(' '));
	});
	vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
		logs.push(a.map(String).join(' '));
	});
	vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => {
		stdout.push(String(s));
		return true;
	}) as typeof process.stdout.write);
	vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => {
		stderr.push(String(s));
		return true;
	}) as typeof process.stderr.write);
	vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
		throw new ExitSignal(code);
	}) as typeof process.exit);
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

async function runCli(...args: string[]): Promise<number | undefined> {
	const program = new Command();
	registerRunCommand(program);
	try {
		await program.parseAsync(['node', 'flow', 'run', ...args]);
	} catch (err) {
		if (err instanceof ExitSignal) {
			return err.code;
		}
		throw err;
	}
	throw new Error('run action returned without calling process.exit');
}

function startedResponse(executionId = 'exec0001'): void {
	harness.send.mockResolvedValue({ type: 'execution_started', executionId });
}

function createExecution(executionId: string, patch: Record<string, unknown>): void {
	fs.mkdirSync(executionsDirOf(harness.dir), { recursive: true });
	const store = new ExecutionStore(executionsDirOf(harness.dir));
	store.create({ executionId, flowFile, flowId: 'f', stepIds: ['first'] });
	store.update(executionId, patch);
}

describe('flow run: argument validation', () => {
	it('rejects an input without "="', async () => {
		expect(await runCli(flowFile, '-i', 'oops')).toBe(1);
		expect(errors).toEqual(["Invalid input: 'oops'. Use key=value"]);
	});

	it('rejects an unknown flow reference with the resolver message', async () => {
		expect(await runCli(path.join(tmpDir, 'missing@nope'))).toBe(1);
		expect(errors[0]).toContain('is not a valid <flow-id>@MAJOR.MINOR.PATCH reference');
	});

	it('rejects a missing mock config file', async () => {
		expect(await runCli(flowFile, '--mock-config', path.join(tmpDir, 'nope.yml'))).toBe(2);
		expect(errors[0]).toContain('Error:Mock config file not found:');
	});

	it('rejects an unparsable mock config', async () => {
		const mock = path.join(tmpDir, 'mock.yml');
		fs.writeFileSync(mock, 'a: [unclosed');
		expect(await runCli(flowFile, '--mock-config', mock)).toBe(2);
		expect(errors[0]).toContain('is not valid YAML/JSON.');
	});

	it('rejects a mock config that is not an object', async () => {
		const mock = path.join(tmpDir, 'mock.yml');
		fs.writeFileSync(mock, '- a\n- b\n');
		expect(await runCli(flowFile, '--mock-config', mock)).toBe(2);
		expect(errors[0]).toContain('must be an object mapping step id to env vars.');
	});

	it('rejects a mock config step id absent from the flow', async () => {
		const mock = path.join(tmpDir, 'mock.yml');
		fs.writeFileSync(mock, 'ghost:\n  X: "1"\n');
		expect(await runCli(flowFile, '--mock-config', mock)).toBe(2);
		expect(errors[0]).toContain("references step 'ghost'");
		expect(errors[0]).toContain('Known step ids: first, second');
	});
});

describe('flow run: dispatch', () => {
	it('sends the run command with inputs and mock env, then prints the execution id', async () => {
		const mock = path.join(tmpDir, 'mock.yml');
		fs.writeFileSync(mock, 'first:\n  X: "1"\n');
		startedResponse();

		expect(await runCli(flowFile, '-i', 'a=b=c', '--inputs', 'n=1', '--mock-config', mock)).toBe(0);

		expect(harness.send).toHaveBeenCalledWith('run', {
			type: 'run',
			flowFile,
			flowId: undefined,
			inputs: { a: 'b=c', n: '1' },
			quiet: undefined,
			cwd: process.cwd(),
			mockEnv: { first: { X: '1' } },
			mockConfigPath: mock,
		});
		expect(logs).toEqual(['exec0001']);
	});

	it('prints JSON for --json and nothing for --quiet', async () => {
		startedResponse();
		expect(await runCli(flowFile, '--json')).toBe(0);
		expect(stdout).toEqual(['{"executionId":"exec0001"}\n']);

		stdout.length = 0;
		logs.length = 0;
		expect(await runCli(flowFile, '--quiet')).toBe(0);
		expect(stdout).toEqual([]);
		expect(logs).toEqual([]);
	});

	it('reports a daemon contact failure', async () => {
		harness.send.mockRejectedValue(new Error('boom'));
		expect(await runCli(flowFile)).toBe(1);
		expect(errors).toEqual(['Failed to contact the daemon.']);
	});

	it('maps daemon error codes to exit codes and formats', async () => {
		harness.send.mockResolvedValue({ type: 'error', code: 'VALIDATION_FAILED', message: 'bad flow' });
		expect(await runCli(flowFile)).toBe(2);
		expect(errors).toEqual(['Error:bad flow']);

		harness.send.mockResolvedValue({ type: 'error', code: 'FLOW_VERSION_UNKNOWN', message: 'no version' });
		expect(await runCli(flowFile, '--json')).toBe(2);
		expect(stderr).toEqual(['{"code":"FLOW_VERSION_UNKNOWN","message":"no version"}\n']);

		errors.length = 0;
		harness.send.mockResolvedValue({ type: 'error', code: 'OTHER', message: 'other' });
		expect(await runCli(flowFile, '--json', '--human')).toBe(1);
		expect(errors).toEqual(['Error:other']);
	});

	it('rejects a response without an executionId', async () => {
		harness.send.mockResolvedValue({ type: 'execution_started' });
		expect(await runCli(flowFile)).toBe(1);
		expect(errors).toEqual([
			'Error: daemon returned a response without an executionId -- try restarting the daemon',
		]);
	});
});

describe('flow run --wait', () => {
	it('prints streamed step logs then the completion line', async () => {
		startedResponse();
		createExecution('exec0001', { status: 'completed' });
		fs.mkdirSync(path.dirname(logFilePath(harness.dir, todayLogDate())), { recursive: true });
		fs.writeFileSync(
			logFilePath(harness.dir, todayLogDate()),
			JSON.stringify({ prefix: '[exec0001|first]', timestamp: 't', level: 'info', message: 'hello' }) + '\n'
		);

		expect(await runCli(flowFile, '--wait')).toBe(0);

		expect(stdout).toHaveLength(1);
		expect(stdout[0]).toMatch(/^\[\d\d:\d\d:\d\d\.\d{3}\] \[first\] hello\n$/);
		expect(logs).toHaveLength(1);
		expect(logs[0]).toMatch(/^Flow completed in \d+ms$/);
	});

	it('reports a failed execution with its reason', async () => {
		startedResponse();
		createExecution('exec0001', { status: 'failed', lastError: 'step exploded' });
		expect(await runCli(flowFile, '--wait', '--quiet')).toBe(1);
		expect(errors).toEqual(['Error:Flow failed -- step exploded']);
		expect(stdout).toEqual([]);
	});

	it('prints a JSON summary in --json mode, even for a failed execution', async () => {
		startedResponse();
		createExecution('exec0001', { status: 'failed' });
		expect(await runCli(flowFile, '--wait', '--json')).toBe(0);
		expect(stdout).toHaveLength(1);
		expect(JSON.parse(stdout[0]!)).toEqual({
			executionId: 'exec0001',
			status: 'failed',
			outputs: {},
			durationMs: expect.any(Number),
		});
	});

	it('exits 124 on timeout, in text and JSON modes', async () => {
		startedResponse();
		expect(await runCli(flowFile, '--wait', '--timeout', '1ms')).toBe(124);
		expect(errors).toEqual(['Error:Execution timed out.']);

		expect(await runCli(flowFile, '--wait', '--timeout', '1ms', '--json')).toBe(124);
		expect(stderr).toEqual(['{"error":"execution_timeout","executionId":"exec0001"}\n']);
	});

	it('reports an unexpected polling error', async () => {
		startedResponse();
		const dir = executionsDirOf(harness.dir);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'exec0001.json'), '{not json');
		expect(await runCli(flowFile, '--wait')).toBe(1);
		expect(errors[0]).toContain('Error:Error: Corrupted execution state for exec0001');
	});

	it('rejects an invalid timeout', async () => {
		startedResponse();
		await expect(runCli(flowFile, '--wait', '--timeout', 'abc')).rejects.toThrow(
			'Invalid timeout: abc. Use e.g. 10m, 30s, 5000ms'
		);
	});
});

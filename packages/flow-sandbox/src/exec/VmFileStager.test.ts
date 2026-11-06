import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { rejection } from '../testing/ExpectedFailures';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { VmFileStager } from './VmFileStager';

const NODE = process.execPath;
let root: string;
let hostTemp: string;
let runtime: FakeSandboxRuntime;
let log: RecordingSandboxLog;
let stager: VmFileStager;
let received: { command: readonly string[]; stdin: string }[];

beforeEach(async () => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-stager-')));
	hostTemp = path.join(root, 'tmp');
	fs.mkdirSync(hostTemp);
	log = new RecordingSandboxLog();
	received = [];
	runtime = new FakeSandboxRuntime({
		clock: new FakeClock(0),
		execHandler: request => {
			received.push({ command: request.command, stdin: String(request.stdin ?? '') });
			return { exitCode: 0, stdout: '', stderr: '' };
		},
	});
	await runtime.create({ name: 'box', agent: 'claude', mounts: [{ hostPath: root }], cpus: 1, memory: '1g' });
	stager = new VmFileStager({
		runtime,
		log,
		hostTempDirectory: hostTemp,
		hostNodePath: NODE,
		platform: process.platform,
	});
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function write(name: string, content: string): string {
	const file = path.join(hostTemp, name);
	fs.writeFileSync(file, content);
	return file;
}

const failure = rejection;

describe('VmFileStager scripts', () => {
	it('copies a generated script into /tmp/flow-staged through stdin, with the path as an argument', async () => {
		const file = write('agent-fleet-script-1-abc.sh', 'echo hi\n');
		const staged = await stager.stage('box', file);
		expect(staged.kind).toBe('script');
		expect(staged.vmPath).toMatch(/^\/tmp\/flow-staged\/[0-9a-f]{16}-agent-fleet-script-1-abc\.sh$/);
		expect(received).toHaveLength(1);
		expect(received[0]?.stdin).toBe('echo hi\n');
		expect(received[0]?.command.at(-1)).toBe(staged.vmPath);
		// The script text is never spliced into the command.
		expect(received[0]?.command.join(' ')).not.toContain('echo hi');
	});

	it('recognises the generated file without staging it twice', () => {
		const file = write('agent-fleet-script-1-abc.sh', 'x');
		expect(stager.isStageable(file)).toBe(true);
		expect(received).toHaveLength(0);
	});
});

describe('VmFileStager MCP config', () => {
	it('stages the rewritten config and reports the host callback port', async () => {
		const file = write(
			'mcp-config-1.json',
			JSON.stringify({
				mcpServers: {
					flow: {
						command: NODE,
						args: [path.join(root, 'worker', 'mcp-server.cjs')],
						env: { FLOW_MCP_CALLBACK_PORT: '41000', FLOW_MCP_CALLBACK_TOKEN: 't', FLOW_EXECUTION_ID: 'e' },
					},
				},
			})
		);
		const staged = await stager.stage('box', file);
		expect(staged.kind).toBe('mcp-config');
		expect(staged.mcpCallbackPort).toBe(41000);
		expect(received[0]?.stdin).toContain('mcp-callback-forwarder.cjs');
		expect(received[0]?.stdin).not.toContain(root.replaceAll('\\', '\\\\'));
	});

	it('refuses a config it cannot rewrite, before anything is copied', async () => {
		const file = write('mcp-config-2.json', JSON.stringify({ mcpServers: { github: { command: 'npx' } } }));
		const error = await failure(stager.stage('box', file));
		expect(error.message).toMatch(/Only the engine's own "flow" server/);
		expect(received).toHaveLength(0);
	});
});

describe('VmFileStager settings', () => {
	it('copies the Claude settings and warns when hooks mention a Windows path', async () => {
		const file = write(
			'claude-settings-1.json',
			JSON.stringify({ hooks: { PreToolUse: [{ command: 'C:\\hook.cmd' }] } })
		);
		const staged = await stager.stage('box', file);
		expect(staged.kind).toBe('settings');
		expect(log.text()).toMatch(/warn: claude-settings-1\.json: .*Windows path/);
	});
});

describe('VmFileStager refusals', () => {
	it('refuses a host file the engine does not generate', async () => {
		const file = write('notes.txt', 'private');
		const error = await failure(stager.stage('box', file));
		expect(error.kind).toBe('path-outside-mounts');
		expect(error.message).toMatch(/not one of the files the engine generates/);
		expect(stager.isStageable(file)).toBe(false);
		expect(received).toHaveLength(0);
	});

	it('refuses a generated name in another directory', async () => {
		const elsewhere = path.join(root, 'elsewhere');
		fs.mkdirSync(elsewhere);
		const file = path.join(elsewhere, 'agent-fleet-script-1-abc.sh');
		fs.writeFileSync(file, 'x');
		expect(stager.isStageable(file)).toBe(false);
		await failure(stager.stage('box', file));
	});

	it('refuses a wrong extension (a node -e script of the generic path is not supported)', async () => {
		const file = write('agent-fleet-script-1-abc.js', 'x');
		expect(stager.isStageable(file)).toBe(false);
	});

	it('refuses a symbolic link even with a generated name', async () => {
		const target = write('secret.txt', 'host secret');
		const link = path.join(hostTemp, 'agent-fleet-script-9-link.sh');
		try {
			fs.symlinkSync(target, link);
		} catch {
			return; // symlinks need a privilege on Windows: nothing to test on this machine
		}
		const error = await failure(stager.stage('box', link));
		expect(error.message).toMatch(/link or not a regular file/);
		expect(received).toHaveLength(0);
	});

	it('refuses a file above the size limit', async () => {
		const file = write('agent-fleet-script-2-big.sh', 'x'.repeat(8 * 1024 * 1024 + 1));
		const error = await failure(stager.stage('box', file));
		expect(error.message).toMatch(/above the .* limit/);
	});

	it('reports a failing copy with the sandbox, the exit code and what to check', async () => {
		runtime.setExecHandler(() => ({
			exitCode: 1,
			stdout: '',
			stderr: 'cat: /tmp/flow-staged: Read-only file system',
		}));
		const file = write('agent-fleet-script-3-ro.sh', 'x');
		const error = await failure(stager.stage('box', file));
		expect(error.kind).toBe('command-failed');
		expect(error.message).toMatch(
			/into sandbox "box" failed with exit code 1.*Read-only file system.*\/tmp is writable/
		);
	});
});

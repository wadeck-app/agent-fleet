import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import { eachRow } from '../testing/EachRow';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { StepCommandTranslator } from './StepCommandTranslator';
import { VmEnvironmentFilter } from './VmEnvironmentFilter';
import { VmFileStager } from './VmFileStager';

const HOST_NODE = process.execPath;
let root: string;
let workspace: string;
let meta: string;
let hostTemp: string;
let elsewhere: string;
let log: RecordingSandboxLog;
let translator: StepCommandTranslator;
let stagedWrites: string[];

function sandboxForm(hostPath: string): string {
	const normalized = hostPath.replace(/\\/g, '/');
	const drive = /^([A-Za-z]):(.*)$/.exec(normalized);
	return drive?.[1] === undefined ? normalized : `/${drive[1].toLowerCase()}${drive[2] ?? ''}`;
}

beforeEach(async () => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-translator-')));
	workspace = path.join(root, 'ws');
	meta = path.join(root, 'ws.meta');
	hostTemp = path.join(root, 'tmp');
	elsewhere = path.join(root, 'elsewhere');
	for (const directory of [workspace, meta, hostTemp, elsewhere]) fs.mkdirSync(directory);
	log = new RecordingSandboxLog();
	stagedWrites = [];
	const runtime = new FakeSandboxRuntime({
		clock: new FakeClock(0),
		execHandler: request => {
			stagedWrites.push(String(request.stdin ?? ''));
			return { exitCode: 0, stdout: '', stderr: '' };
		},
	});
	await runtime.create({ name: 'box', agent: 'claude', mounts: [{ hostPath: workspace }], cpus: 1, memory: '1g' });
	translator = new StepCommandTranslator({
		mounts: new RunMounts({ workspaceDir: workspace, workspaceMetaDir: meta, platform: process.platform, log }),
		stager: new VmFileStager({
			runtime,
			log,
			hostTempDirectory: hostTemp,
			hostNodePath: HOST_NODE,
			platform: process.platform,
		}),
		environment: new VmEnvironmentFilter({ FLOW_WORKER_TOKEN: 'launch-token', SHARED: 'same' }),
		hostNodePath: HOST_NODE,
		log,
		declaredEnvironmentNames: new Set(['STEP_VAR', 'OUT']),
	});
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function request(overrides: Partial<Parameters<StepCommandTranslator['translate']>[0]>) {
	return {
		sandbox: 'box',
		command: 'bash',
		args: [] as string[],
		shell: undefined,
		cwd: undefined,
		env: undefined,
		...overrides,
	};
}

async function refusal(promise: Promise<unknown>): Promise<SandboxError> {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(SandboxError);
		return error as SandboxError;
	}
	throw new Error('expected a refusal');
}

describe('StepCommandTranslator program', () => {
	// Core 1f4b567a: the shell strategy asks the launcher, so the bash path the engine hands over is already the VM's. A HOST bash path
	// means the engine resolved on the host (an old flow-cli): refused, saying so, instead of quietly mapped.
	it('passes the VM bash path of the strategy through and stages the script', async () => {
		const script = path.join(hostTemp, 'agent-fleet-script-2-y.sh');
		fs.writeFileSync(script, 'echo vm');

		const translated = await translator.translate(
			request({ command: '/usr/bin/bash', args: ['-e', '-u', script], cwd: workspace })
		);

		const [, , , , , copy, ...program] = translated.command;
		expect(program).toEqual(['/usr/bin/bash', '-e', '-u', copy]);
		expect(translated.program).toBe('bash');
	});

	it.each([
		['Git Bash', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'],
		['a bash.exe elsewhere', 'D:\\tools\\bash.exe'],
	])(
		'refuses a host path to bash (%s): the engine must resolve the shell through the sandbox launcher',
		async (_name, command) => {
			const error = await refusal(translator.translate(request({ command, args: ['-c', 'echo'] })));

			expect(error.message).toMatch(
				/host path[\s\S]*resolve the shell through the sandbox launcher[\s\S]*flow-cli/
			);
		}
	);

	it('stages the script, filters the environment and translates the cwd for the VM bash', async () => {
		const script = path.join(hostTemp, 'agent-fleet-script-1-x.sh');
		fs.writeFileSync(script, 'echo hi');
		const translated = await translator.translate(
			request({
				command: '/usr/bin/bash',
				args: ['-e', '-u', script],
				cwd: workspace,
				env: { PATH: 'C:\\Git', HOME: 'C:\\Users\\me', STEP_VAR: '1' },
			})
		);
		// The copy is removed by the same exec: bash -c <cleanup> flow-run 1 <copy> bash -e -u <copy>.
		const [shell, flag, cleanup, name, count, copy, ...program] = translated.command;
		expect([shell, flag, name, count]).toEqual(['bash', '-c', 'flow-run', '1']);
		expect(cleanup).toContain('"${files[@]}"; exit $rc');
		expect(copy).toMatch(/^\/tmp\/flow-staged\/[0-9a-f]{16}-agent-fleet-script-1-x\.sh$/);
		expect(program).toEqual(['/usr/bin/bash', '-e', '-u', copy]);
		expect(translated.program).toBe('bash');
		expect(translated.cwd).toBe(sandboxForm(workspace));
		expect(translated.env).toEqual({ STEP_VAR: '1' });
		expect(stagedWrites).toEqual(['echo hi']);
	});

	it('maps the host node to node', async () => {
		const translated = await translator.translate(request({ command: HOST_NODE, args: ['--version'] }));
		expect(translated.command).toEqual(['node', '--version']);
	});

	it('passes a VM absolute path and a bare name through', async () => {
		expect(
			(await translator.translate(request({ command: '/home/agent/.local/bin/claude', args: ['-p'] }))).command
		).toEqual(['/home/agent/.local/bin/claude', '-p']);
		expect((await translator.translate(request({ command: 'claude' }))).command).toEqual(['claude']);
	});

	it('runs a command line with shell: true under /bin/sh -c', async () => {
		const translated = await translator.translate(request({ command: 'echo $HOME && ls', shell: true }));
		expect(translated.command).toEqual(['/bin/sh', '-c', 'echo $HOME && ls']);
	});

	it('runs a command line under bash when the shell is a bash path, and refuses other shells', async () => {
		const bash = await translator.translate(request({ command: 'echo x', shell: '/usr/bin/bash' }));
		expect(bash.command).toEqual(['bash', '-c', 'echo x']);
		const error = await refusal(
			translator.translate(request({ command: 'dir', shell: 'C:\\Windows\\System32\\cmd.exe' }))
		);
		expect(error.message).toMatch(/only sh and bash are/);
	});

	it('refuses what a sandbox cannot run (each case)', () =>
		eachRow(
			[
				['C:\\Windows\\System32\\cmd.exe', /cmd\.exe does not exist in the VM.*without the "sandbox" label/],
				['pwsh', /PowerShell does not exist in the VM/],
				['powershell.exe', /PowerShell does not exist in the VM/],
			],
			async (command, pattern) => {
				const error = await refusal(translator.translate(request({ command, args: ['/c', 'dir'] })));
				expect(error.message).toMatch(pattern);
			}
		));

	it('refuses a host program the VM does not have, and a shell with arguments', async () => {
		expect((await refusal(translator.translate(request({ command: 'C:\\tools\\mytool.exe' })))).message).toMatch(
			/host path and the VM has no such program/
		);
		expect(
			(await refusal(translator.translate(request({ command: 'ls', args: ['-l'], shell: true })))).message
		).toMatch(/both arguments and a shell/);
	});
});

describe('StepCommandTranslator paths', () => {
	it('translates an argument inside the mounts', async () => {
		const inside = path.join(workspace, 'data.txt');
		const translated = await translator.translate(request({ command: 'cat', args: [inside] }));
		expect(translated.command).toEqual(['cat', sandboxForm(inside)]);
	});

	it('refuses hostile arguments: outside the mounts, UNC, another host file in the temp directory', async () => {
		const outside = path.join(elsewhere, 'secret.txt');
		fs.writeFileSync(outside, 'host secret');
		const notEngineFile = path.join(hostTemp, 'notes.txt');
		fs.writeFileSync(notEngineFile, 'host secret');
		for (const argument of [
			outside,
			'\\\\server\\share\\x',
			notEngineFile,
			`${workspace}\\..\\elsewhere\\secret.txt`,
		]) {
			const error = await refusal(translator.translate(request({ command: 'cat', args: [argument] })));
			expect(error.kind).toBe('path-outside-mounts');
		}
		expect(stagedWrites).toEqual([]);
	});

	it('refuses a cwd outside the mounts', async () => {
		const error = await refusal(translator.translate(request({ cwd: elsewhere })));
		expect(error.kind).toBe('path-outside-mounts');
	});

	it('refuses a cwd through a link', async () => {
		const link = path.join(workspace, 'link');
		try {
			fs.symlinkSync(elsewhere, link, 'junction');
		} catch {
			return; // cannot create links here
		}
		const error = await refusal(translator.translate(request({ cwd: link })));
		expect(error.kind).toBe('path-outside-mounts');
	});

	it('reports a Windows path kept in the environment', async () => {
		await translator.translate(request({ env: { OUT: 'C:\\somewhere' } }));
		expect(log.text()).toMatch(/warn: .*Windows paths.*OUT/);
	});
});

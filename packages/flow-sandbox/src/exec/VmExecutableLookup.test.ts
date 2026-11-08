import { BashShellStrategy, PwshShellStrategy } from 'flow-engine';
import { beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../FakeClock';
import { FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { failure } from '../testing/ExpectedFailures';
import { VmExecutableLookup } from './VmExecutableLookup';

let runtime: FakeSandboxRuntime;
let lookup: VmExecutableLookup;
let execs: string[][];

beforeEach(async () => {
	execs = [];
	runtime = new FakeSandboxRuntime({
		clock: new FakeClock(0),
		execHandler: request => {
			execs.push([...request.command]);
			return {
				exitCode: 0,
				stdout: 'claude=/home/agent/.local/bin/claude\nnode=/usr/bin/node\nbash=/bin/bash\n',
				stderr: '',
			};
		},
	});
	await runtime.create({
		name: 'box',
		agent: 'claude',
		mounts: [{ hostPath: process.cwd() }],
		cpus: 1,
		memory: '1g',
	});
	lookup = new VmExecutableLookup(runtime);
});

describe('VmExecutableLookup', () => {
	it('primes with ONE exec in the VM and answers which/where lookups from it', async () => {
		await lookup.prime('box');
		await lookup.prime('box');
		expect(execs).toHaveLength(1);
		expect(execs[0]?.slice(0, 2)).toEqual(['bash', '-c']);
		expect(lookup.answer('box', 'which claude')).toBe('/home/agent/.local/bin/claude');
		expect(lookup.answer('box', 'where claude')).toBe('/home/agent/.local/bin/claude');
		expect(lookup.answer('box', 'where.exe node.exe')).toBe('/usr/bin/node');
	});

	it('throws (read as "not found" by the engine) for a program the VM does not have', async () => {
		await lookup.prime('box');
		const error = failure(() => lookup.answer('box', 'which codex'));
		expect(error.kind).toBe('not-found');
		expect(error.message).toMatch(/"codex" is not installed in sandbox "box".*primed: claude, node, bash/);
	});

	// Core 1f4b567a: a launcher that declares isolatesEnvironment is the ONLY source of the shell: `which bash` / `which pwsh`, whatever the host.
	it('answers which bash from the VM table, and says why pwsh is not there (not in the image)', async () => {
		await lookup.prime('box');

		expect(lookup.answer('box', 'which bash')).toBe('/bin/bash');
		const error = failure(() => lookup.answer('box', 'which pwsh'));
		expect(error.kind).toBe('not-found');
		expect(error.message).toMatch(/"pwsh" is not installed in sandbox "box"[\s\S]*shell: pwsh[\s\S]*image/);
	});

	it('primes pwsh too, so the table says "absent" instead of "never asked"', async () => {
		await lookup.prime('box');

		expect(execs[0]).toContain('pwsh');
	});

	it('lets the real shell strategies of the engine resolve through it: bash is the VM path, pwsh fails with the reason', async () => {
		await lookup.prime('box');
		const launcher = {
			isolatesEnvironment: true,
			lookupExecutable: (command: string) => lookup.answer('box', command),
		};

		expect(new BashShellStrategy(launcher as never).resolve({})).toBe('/bin/bash');
		expect(() => new PwshShellStrategy(launcher as never).resolve({})).toThrow(
			/pwsh not found in the sandbox launcher[\s\S]*not installed in sandbox "box"/
		);
	});

	it('throws when nothing was primed for the sandbox', () => {
		expect(failure(() => lookup.answer('box', 'which claude')).message).toMatch(
			/call prime\(\) before the first step/
		);
	});

	it('refuses lookup commands it does not understand', async () => {
		await lookup.prime('box');
		expect(failure(() => lookup.answer('box', 'rm -rf /')).message).toMatch(/only answers "which <name>"/);
		expect(failure(() => lookup.answer('box', 'which a b')).kind).toBe('invalid-argument');
	});

	it('refuses to prime a name that is not a plain program name, without calling the VM', async () => {
		await expect(lookup.prime('box', ['claude; rm -rf /'])).rejects.toThrow(/not a plain program name/);
		expect(execs).toHaveLength(0);
	});

	it('reports a failing prime with what to check', async () => {
		runtime.setExecHandler(() => ({ exitCode: 127, stdout: '', stderr: 'bash: not found' }));
		await expect(lookup.prime('box')).rejects.toThrow(/failed with exit code 127.*image has bash/);
	});
});

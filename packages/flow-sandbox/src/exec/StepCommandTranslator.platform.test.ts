import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { PureMounts } from '../testing/PureMounts';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { StepCommandTranslator } from './StepCommandTranslator';
import { VmEnvironmentFilter } from './VmEnvironmentFilter';
import type { VmFileStager } from './VmFileStager';

/**
 * Every case runs for a Windows host and for a POSIX host, whatever machine runs the test: the translator takes the platform as a
 * parameter and the mounts are strings (PureMounts). What a "host path" is differs between the two, which is what is protected here.
 */
interface Flavor {
	name: string;
	platform: NodeJS.Platform;
	pathModule: path.PlatformPath;
	workspace: string;
	meta: string;
	temp: string;
	/** Known host directories (POSIX only; a Windows drive letter needs no list). */
	hostDirectories: string[];
	node: string;
	/** A host file outside the mounts, in a known host directory. */
	hostFileOutside: string;
	/** A host path to a shell. */
	hostBash: string;
	/** The sandbox form of a host path under the mounts. */
	toSandbox: (hostPath: string) => string;
}

const FLAVORS: Flavor[] = [
	{
		name: 'Windows host',
		platform: 'win32',
		pathModule: path.win32,
		workspace: 'C:\\runs\\ws',
		meta: 'C:\\runs\\ws.meta',
		temp: 'C:\\Users\\me\\AppData\\Local\\Temp',
		hostDirectories: [],
		node: 'C:\\Program Files\\nodejs\\node.exe',
		hostFileOutside: 'C:\\Users\\me\\secret.txt',
		hostBash: 'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
		toSandbox: hostPath => `/c${hostPath.slice(2).replaceAll('\\', '/')}`,
	},
	{
		name: 'POSIX host',
		platform: 'linux',
		pathModule: path.posix,
		workspace: '/work/runs/ws',
		meta: '/work/runs/ws.meta',
		temp: '/tmp',
		hostDirectories: ['/tmp', '/home/me'],
		node: '/opt/hostedtoolcache/node/24/x64/bin/node',
		hostFileOutside: '/home/me/secret.txt',
		hostBash: '/tmp/tools/bash',
		toSandbox: hostPath => hostPath,
	},
];

function translatorFor(flavor: Flavor): StepCommandTranslator {
	const stager = {
		isStageable: (hostPath: string) =>
			flavor.pathModule.dirname(hostPath) === flavor.temp &&
			flavor.pathModule.basename(hostPath).startsWith('agent-fleet-script-'),
		stage: (_sandbox: string, hostPath: string) =>
			Promise.resolve({ vmPath: `/tmp/flow-staged/${flavor.pathModule.basename(hostPath)}`, kind: 'script' }),
	} as unknown as VmFileStager;
	return new StepCommandTranslator({
		mounts: new PureMounts({ workspaceDir: flavor.workspace, workspaceMetaDir: flavor.meta }, flavor.platform),
		platform: flavor.platform,
		hostDirectories: flavor.hostDirectories,
		stager,
		environment: new VmEnvironmentFilter({}),
		hostNodePath: flavor.node,
		log: new RecordingSandboxLog(),
		declaredEnvironmentNames: new Set(),
	});
}

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

describe.each(FLAVORS)('StepCommandTranslator on a $name', flavor => {
	const translator = translatorFor(flavor);
	const join = (...segments: string[]): string => flavor.pathModule.join(...segments);

	it('copies the generated script into the VM and runs the VM bash path of the strategy on the copy', async () => {
		const script = join(flavor.temp, 'agent-fleet-script-1-x.sh');

		const translated = await translator.translate(
			request({ command: '/usr/bin/bash', args: ['-e', '-u', script], cwd: flavor.workspace })
		);

		const [shell, flag, , name, count, copy, ...program] = translated.command;
		expect([shell, flag, name, count]).toEqual(['bash', '-c', 'flow-run', '1']);
		expect(copy).toBe('/tmp/flow-staged/agent-fleet-script-1-x.sh');
		expect(program).toEqual(['/usr/bin/bash', '-e', '-u', copy]);
		expect(translated.program).toBe('bash');
		expect(translated.cwd).toBe(flavor.toSandbox(flavor.workspace));
	});

	it('maps the host node to node, wherever the host keeps it', async () => {
		const translated = await translator.translate(request({ command: flavor.node, args: ['--version'] }));

		expect(translated.command).toEqual(['node', '--version']);
	});

	it('translates an argument inside the mounts (the workspace and .meta)', async () => {
		for (const inside of [join(flavor.workspace, 'data.txt'), join(flavor.meta, 'outputs', 'out.json')]) {
			const translated = await translator.translate(request({ command: 'cat', args: [inside] }));

			expect(translated.command).toEqual(['cat', flavor.toSandbox(inside)]);
		}
	});

	it('refuses, with the mounts named, a host file outside them (no silent pass-through)', async () => {
		const error = await refusal(translator.translate(request({ command: 'cat', args: [flavor.hostFileOutside] })));

		expect(error.kind).toBe('path-outside-mounts');
		expect(error.message).toContain(flavor.hostFileOutside);
	});

	it('refuses a file of the host temp directory the engine did not generate', async () => {
		const error = await refusal(
			translator.translate(request({ command: 'cat', args: [join(flavor.temp, 'notes.txt')] }))
		);

		expect(error.kind).toBe('path-outside-mounts');
	});

	it('refuses an argument that climbs out of the mounts with ..', async () => {
		const climbing = `${flavor.workspace}${flavor.pathModule.sep}..${flavor.pathModule.sep}ws.meta${flavor.pathModule.sep}..${flavor.pathModule.sep}other.txt`;

		const error = await refusal(translator.translate(request({ command: 'cat', args: [climbing] })));

		expect(error.kind).toBe('path-outside-mounts');
	});

	it('refuses a UNC argument', async () => {
		const error = await refusal(translator.translate(request({ command: 'cat', args: ['\\\\server\\share\\x'] })));

		expect(error.kind).toBe('path-outside-mounts');
		expect(error.message).toMatch(/UNC/);
	});

	it('refuses a host path to a shell: the engine must resolve the shell through the sandbox launcher', async () => {
		const error = await refusal(translator.translate(request({ command: flavor.hostBash, args: ['-c', 'echo'] })));

		expect(error.message).toMatch(/host path[\s\S]*resolve the shell through the sandbox launcher/);
	});

	it('passes an absolute VM path through, as an argument and as a program (it cannot be a host file)', async () => {
		const translated = await translator.translate(
			request({ command: '/home/agent/.local/bin/claude', args: ['--add-dir', '/usr/share/doc', '/review'] })
		);

		expect(translated.command).toEqual(['/home/agent/.local/bin/claude', '--add-dir', '/usr/share/doc', '/review']);
	});
});

describe.each(FLAVORS)('StepCommandTranslator codex and opencode on a $name', flavor => {
	const translator = translatorFor(flavor);

	// Since the engine resolvers ask the launcher (flow-engine SandboxExecutableLookup), the program the engine starts is the VM path of the lookup,
	// on every host: nothing special is left to do for codex and opencode.
	it.each([
		['codex', '/home/agent/.local/bin/codex'],
		['opencode', '/home/agent/.local/bin/opencode'],
	])(
		'runs the VM path the engine got from the lookup for %s, with its arguments, unchanged',
		async (program, vmPath) => {
			const translated = await translator.translate(
				request({ command: vmPath, args: ['exec', '--json', '--', 'a prompt; with $chars'] })
			);

			expect(translated.command).toEqual([vmPath, 'exec', '--json', '--', 'a prompt; with $chars']);
			expect(translated.program).toBe(program);
		}
	);

	it.each([
		['codex', 'a bare name (the old Windows-host fallback of the engine: no special case any more)'],
		['opencode', 'a bare name (the old Windows-host fallback of the engine: no special case any more)'],
		['git', 'another bare name'],
		['codex --dangerously-bypass-approvals-and-sandbox', 'a name with a space'],
		['/usr/bin/codex', 'a path'],
	])('refuses shell: true with arguments for %s (%s)', async (command, _name) => {
		const error = await refusal(translator.translate(request({ command, args: ['x'], shell: true })));

		expect(error.message).toMatch(/both arguments and a shell/);
	});

	it('does not forward the isolated XDG_CONFIG_HOME the engine makes for opencode in the host temp directory (the VM has no such directory)', async () => {
		const isolated = flavor.pathModule.join(flavor.temp, 'opencode-run-123e4567-e89b-12d3-a456-426614174000');

		const translated = await translator.translate(
			request({
				command: '/usr/bin/opencode',
				args: ['run'],
				env: { XDG_CONFIG_HOME: isolated, XDG_DATA_HOME: '/mnt/store' },
			})
		);

		expect(translated.env).toEqual({ XDG_DATA_HOME: '/mnt/store' });
	});

	it('keeps an XDG_CONFIG_HOME that is not the engine isolated directory', async () => {
		const translated = await translator.translate(
			request({ command: '/usr/bin/opencode', args: ['run'], env: { XDG_CONFIG_HOME: '/home/agent/.config' } })
		);

		expect(translated.env).toEqual({ XDG_CONFIG_HOME: '/home/agent/.config' });
	});
});

describe('StepCommandTranslator rule for an absolute path on a POSIX host', () => {
	// On a POSIX host a host path and a VM path look alike: only the mounts and the known host directories identify a host file.
	// A path elsewhere is assumed to be a VM path. This is the documented limit, pinned so that it changes on purpose.
	it('treats an absolute path outside the mounts and the known host directories as a VM path', async () => {
		const posix = FLAVORS[1] as Flavor;

		const translated = await translatorFor(posix).translate(
			request({ command: 'cat', args: ['/etc/hostname', '/var/log/syslog'] })
		);

		expect(translated.command).toEqual(['cat', '/etc/hostname', '/var/log/syslog']);
	});
});

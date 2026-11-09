import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { PureMounts } from '../testing/PureMounts';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { StepCommandTranslator } from './StepCommandTranslator';
import { VmEnvironmentFilter } from './VmEnvironmentFilter';
import type { VmFileStager } from './VmFileStager';

/**
 * Every refusal about a host path must NAME the offending value and say what to do. Table over the refusal sites of the translator, for a
 * Windows host and a POSIX host on any machine, plus a test that each workaround the messages suggest is really accepted.
 */
interface Flavor {
	name: string;
	platform: NodeJS.Platform;
	pathModule: path.PlatformPath;
	workspace: string;
	meta: string;
	temp: string;
	hostDirectories: string[];
	node: string;
	hostFileOutside: string;
	unknownHostProgram: string;
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
		unknownHostProgram: 'C:\\tools\\mytool.exe',
	},
	{
		name: 'POSIX host',
		platform: 'linux',
		pathModule: path.posix,
		workspace: '/work/runs/ws',
		meta: '/work/runs/ws.meta',
		temp: '/tmp',
		hostDirectories: ['/tmp', '/home/me'],
		node: '/opt/node/bin/node',
		hostFileOutside: '/home/me/secret.txt',
		unknownHostProgram: '/home/me/bin/mytool',
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
		command: 'cat',
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

describe.each(FLAVORS)('StepCommandTranslator refusal messages on a $name', flavor => {
	const translator = translatorFor(flavor);

	// Each row: where the refusal comes from, what the user wrote (must appear in the message), and the action the message must give.
	const sites: { site: string; offending: string; run: () => Promise<unknown>; action: RegExp }[] = [
		{
			site: 'an argument that is a host file outside the mounts',
			offending: flavor.hostFileOutside,
			run: () => translator.translate(request({ args: [flavor.hostFileOutside] })),
			action: /put it under the workspace[\s\S]*literal value[\s\S]*script text/,
		},
		{
			site: 'a UNC argument',
			offending: '\\\\server\\share\\x',
			run: () => translator.translate(request({ args: ['\\\\server\\share\\x'] })),
			action: /copy (it|the file) under the workspace|put it under the workspace/,
		},
		{
			site: 'a cwd outside the mounts',
			offending: flavor.hostFileOutside,
			run: () => translator.translate(request({ cwd: flavor.hostFileOutside })),
			action: /use a path inside one of them/,
		},
		{
			site: 'a program that is a host path',
			offending: flavor.unknownHostProgram,
			run: () => translator.translate(request({ command: flavor.unknownHostProgram })),
			action: /call a program that exists in the sandbox image/i,
		},
	];

	it.each(sites)('names the offending value and says what to do: $site', async ({ offending, run, action }) => {
		const error = await refusal(run());

		expect(error.message).toContain(offending);
		expect(error.message).toMatch(action);
	});

	// The messages suggest two ways out; both are accepted by the translator, so the advice is not invented.
	it('accepts the workaround "put the file under the workspace": the same file inside the mounts is translated', async () => {
		const inside = flavor.pathModule.join(flavor.workspace, 'secret.txt');

		const translated = await translator.translate(request({ args: [inside] }));

		expect(translated.command[0]).toBe('cat');
		expect(translated.command[1]).not.toBe(flavor.hostFileOutside);
		expect(translated.command[1]).toContain('secret.txt');
	});

	it('accepts the workaround "write the literal in the script text": the script is the only argument, its content is never inspected', async () => {
		// The engine passes the script FILE; what the script says (an absolute host-looking path included) is not an argument.
		const script = flavor.pathModule.join(flavor.temp, 'agent-fleet-script-7-z.sh');

		const translated = await translator.translate(
			request({ command: '/usr/bin/bash', args: ['-e', '-u', script], cwd: flavor.workspace })
		);

		expect(translated.command).toContain('/tmp/flow-staged/agent-fleet-script-7-z.sh');
	});
});

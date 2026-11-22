import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { PureMounts } from '../testing/PureMounts';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { StepCommandTranslator } from './StepCommandTranslator';
import { VmEnvironmentFilter } from './VmEnvironmentFilter';
import type { StagedFile, VmFileStager } from './VmFileStager';

/**
 * The engine (CodexModelProvider + CodexConfigBuilder.hookOverride) writes the hook script to `<host temp>/codex-run-<uuid>/hook.cjs` and
 * passes `-c hooks.PreToolUse=[{ matcher = "*", hooks = [{ type = "command", command = "node \"<path, forward slashes>\" pre", timeout = 30 }] }]`
 * plus `--dangerously-bypass-hook-trust`. The value is a TOML string, so the quotes around the path are escaped as `\"`.
 * Both host flavors run on any machine (the translator takes the platform as a parameter).
 */
interface Flavor {
	name: string;
	platform: NodeJS.Platform;
	pathModule: path.PlatformPath;
	temp: string;
	/** The temp directory of a user whose name has a space. */
	tempWithSpace: string;
	/** How the engine spells a host path in the hook command (backslashes turned into slashes). */
	engineSpelling: (hostPath: string) => string;
}

const FLAVORS: Flavor[] = [
	{
		name: 'Windows host',
		platform: 'win32',
		pathModule: path.win32,
		temp: 'C:\\Users\\me\\AppData\\Local\\Temp',
		tempWithSpace: 'C:\\Users\\Jane Doe\\AppData\\Local\\Temp',
		engineSpelling: hostPath => hostPath.replace(/\\/g, '/'),
	},
	{
		name: 'POSIX host',
		platform: 'linux',
		pathModule: path.posix,
		temp: '/tmp',
		tempWithSpace: '/var/folders/my tmp',
		engineSpelling: hostPath => hostPath,
	},
];

const UUID = '3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b34';
const OPEN = 'hooks.PreToolUse=[{ matcher = "*", hooks = [{ type = "command", command = "node \\"';
const CLOSE = '\\" pre", timeout = 30 }] }]';
const VM_COPY = '/tmp/flow-staged/abcd-hook.cjs';

function codexHook(vmPath: string): StagedFile {
	return { vmPath, kind: 'codex-hook' };
}

describe.each(FLAVORS)('StepCommandTranslator codex hook on a $name', flavor => {
	const staged: string[] = [];

	function translatorFor(temp: string, stage?: () => StagedFile): StepCommandTranslator {
		const stager = {
			isStageable: (hostPath: string) =>
				flavor.pathModule.basename(hostPath) === 'hook.cjs' &&
				flavor.pathModule.basename(flavor.pathModule.dirname(hostPath)).startsWith('codex-run-') &&
				flavor.pathModule.normalize(flavor.pathModule.dirname(flavor.pathModule.dirname(hostPath))) ===
					flavor.pathModule.normalize(temp),
			stage: (_sandbox: string, hostPath: string) => {
				staged.push(hostPath);
				return Promise.resolve((stage ?? (() => codexHook(VM_COPY)))());
			},
		} as unknown as VmFileStager;
		return new StepCommandTranslator({
			mounts: new PureMounts(
				flavor.platform === 'win32'
					? { workspaceDir: 'C:\\runs\\ws', workspaceMetaDir: 'C:\\runs\\ws.meta' }
					: { workspaceDir: '/work/runs/ws', workspaceMetaDir: '/work/runs/ws.meta' },
				flavor.platform
			),
			platform: flavor.platform,
			hostDirectories: flavor.platform === 'win32' ? [] : ['/tmp', '/home/me', '/var/folders'],
			stager,
			environment: new VmEnvironmentFilter({}),
			hostNodePath: flavor.platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/local/bin/node',
			log: new RecordingSandboxLog(),
			declaredEnvironmentNames: new Set(),
		});
	}

	const hookPath = (temp: string): string => flavor.pathModule.join(temp, `codex-run-${UUID}`, 'hook.cjs');
	const value = (hostPath: string): string => `${OPEN}${flavor.engineSpelling(hostPath)}${CLOSE}`;
	const translate = (translator: StepCommandTranslator, args: string[]) =>
		translator.translate({
			sandbox: 'box',
			command: '/home/agent/.local/bin/codex',
			args,
			shell: undefined,
			cwd: undefined,
			env: undefined,
		});

	async function refusal(promise: Promise<unknown>): Promise<SandboxError> {
		try {
			await promise;
		} catch (error) {
			expect(error).toBeInstanceOf(SandboxError);
			return error as SandboxError;
		}
		throw new Error('expected a refusal');
	}

	it.each([
		['a plain path', 'temp'],
		['a path with a space', 'tempWithSpace'],
	] as const)(
		'copies the hook script into the VM and replaces %s by the VM path, the rest of the value byte-identical',
		async (_name, which) => {
			staged.length = 0;
			const temp = flavor[which];
			const hostPath = hookPath(temp);

			const translated = await translate(translatorFor(temp), [
				'exec',
				'-c',
				value(hostPath),
				'--dangerously-bypass-hook-trust',
				'--',
				'a prompt',
			]);

			expect(staged).toEqual([flavor.engineSpelling(hostPath)]);
			// The cleanup wrapper lists the staged copy, so it is deleted when the process ends.
			expect(translated.command.slice(0, 6)).toEqual([
				'bash',
				'-c',
				expect.any(String),
				'flow-run',
				'1',
				VM_COPY,
			]);
			expect(translated.command.slice(6)).toEqual([
				'/home/agent/.local/bin/codex',
				'exec',
				'-c',
				`${OPEN}${VM_COPY}${CLOSE}`,
				'--dangerously-bypass-hook-trust',
				'--',
				'a prompt',
			]);
		}
	);

	it('leaves the other -c values and the other arguments alone, and copies nothing for them', async () => {
		staged.length = 0;
		const args = [
			'-c',
			'model_provider="amazon-bedrock"',
			'-c',
			'web_search="disabled"',
			'--disable',
			'shell_tool',
			'exec',
		];

		const translated = await translate(translatorFor(flavor.temp), args);

		expect(translated.command).toEqual(['/home/agent/.local/bin/codex', ...args]);
		expect(staged).toEqual([]);
	});

	it.each([
		['another matcher', (p: string) => `${OPEN.replace('"*"', '"bash"')}${p}${CLOSE}`],
		['a command that is not node', (p: string) => `${OPEN.replace('node', 'sh')}${p}${CLOSE}`],
		['more text after the path in the command', (p: string) => `${OPEN}${p}\\" pre; echo x", timeout = 30 }] }]`],
		['a path with escaped backslashes (the engine writes slashes)', () => `${OPEN}C:\\\\x\\\\hook.cjs${CLOSE}`],
		['no path at all', () => `${OPEN}${CLOSE}`],
		['a trailing key', (p: string) => `${OPEN}${p}${CLOSE} extra = 1`],
	])('refuses a value with %s, never passing the host path through', async (_name, build) => {
		staged.length = 0;

		const error = await refusal(
			translate(translatorFor(flavor.temp), ['-c', build(flavor.engineSpelling(hookPath(flavor.temp)))])
		);

		expect(error.kind).toBe('invalid-argument');
		expect(error.message).toMatch(/hooks\.PreToolUse[\s\S]*not the shape the engine writes/);
		expect(staged).toEqual([]);
	});

	it('refuses a hook script the stager does not recognise (a path elsewhere), saying so', async () => {
		const elsewhere = flavor.pathModule.join(flavor.temp, 'other', `codex-run-${UUID}`, 'hook.cjs');

		const error = await refusal(translate(translatorFor(flavor.temp), ['-c', value(elsewhere)]));

		expect(error.message).toMatch(/hooks\.PreToolUse[\s\S]*not a hook script the engine generates/);
		expect(staged).toEqual([]);
	});

	it('refuses a staged file that is not a codex hook', async () => {
		const translator = translatorFor(flavor.temp, () => ({ vmPath: '/tmp/flow-staged/x.sh', kind: 'script' }));

		const error = await refusal(translate(translator, ['-c', value(hookPath(flavor.temp))]));

		expect(error.message).toMatch(/hooks\.PreToolUse/);
	});

	it.each(['hooks.PostToolUse', 'hooks.SessionStart', 'hooks'])(
		'refuses the setting %s (only deny hooks before a tool call are supported)',
		async key => {
			const error = await refusal(
				translate(translatorFor(flavor.temp), ['-c', `${key}=[{ matcher = "*", hooks = [] }]`])
			);

			expect(error.kind).toBe('invalid-argument');
			expect(error.message).toMatch(/only deny hooks that act before a tool call/);
		}
	);

	it('does not touch a hooks.PreToolUse text that is not the value of a -c flag', async () => {
		const translated = await translate(translatorFor(flavor.temp), ['exec', '--', 'hooks.PreToolUse=[]']);

		expect(translated.command).toEqual(['/home/agent/.local/bin/codex', 'exec', '--', 'hooks.PreToolUse=[]']);
	});
});

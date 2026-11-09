import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import { eachRow } from '../testing/EachRow';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { AssignmentRewriter } from './AssignmentRewriter';
import type { JsonObject } from './HarnessMessages';

let root: string;
let mounts: RunMounts;
let log: RecordingSandboxLog;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-rewrite-')));
	fs.mkdirSync(path.join(root, 'ws'));
	fs.mkdirSync(path.join(root, 'ws.meta'));
	fs.mkdirSync(path.join(root, 'project'));
	log = new RecordingSandboxLog();
	mounts = new RunMounts({
		workspaceDir: path.join(root, 'ws'),
		workspaceMetaDir: path.join(root, 'ws.meta'),
		platform: process.platform,
		log,
	});
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function rewriter(injected: Record<string, string> = { INJECTED: 'yes' }): AssignmentRewriter {
	return new AssignmentRewriter({ mounts, log, injectedEnv: type => ({ ...injected, FOR_TYPE: type }) });
}

function assign(overrides: { step?: JsonObject; context?: JsonObject } = {}): JsonObject {
	return {
		type: 'assign',
		assignmentId: 'a1',
		stepId: 'build',
		stepConfig: { id: 'build', type: 'script', script: 'echo hi', ...overrides.step },
		executionContext: {
			executionId: 'exec1',
			inputs: { name: 'x' },
			stepOutputs: {},
			stepMeta: {},
			workspaceDir: path.join(root, 'ws'),
			outputsDir: path.join(root, 'ws.meta', 'outputs'),
			cwd: path.join(root, 'project'),
			...overrides.context,
		},
	};
}

const sandboxPath = (hostPath: string): string => mounts.toSandboxPath(hostPath, 'test');

describe('AssignmentRewriter paths', () => {
	it('translates workspaceDir and outputsDir to the sandbox form', () => {
		const { message } = rewriter().rewrite(assign());

		const context = message['executionContext'] as JsonObject;
		expect(context['workspaceDir']).toBe(sandboxPath(path.join(root, 'ws')));
		expect(context['outputsDir']).toBe(sandboxPath(path.join(root, 'ws.meta', 'outputs')));
	});

	it('replaces a cwd outside the mounts by the sandbox workspace and logs it', () => {
		const { message } = rewriter().rewrite(assign());

		expect((message['executionContext'] as JsonObject)['cwd']).toBe(sandboxPath(path.join(root, 'ws')));
		expect(log.text()).toContain('outside the sandbox mounts');
	});

	it('translates a cwd inside the workspace', () => {
		fs.mkdirSync(path.join(root, 'ws', 'sub'));

		const { message } = rewriter().rewrite(assign({ context: { cwd: path.join(root, 'ws', 'sub') } }));

		expect((message['executionContext'] as JsonObject)['cwd']).toBe(sandboxPath(path.join(root, 'ws', 'sub')));
		expect(log.text()).not.toContain('outside the sandbox mounts');
	});

	it('refuses an outputsDir outside the mounts', () => {
		expect(() =>
			rewriter().rewrite(assign({ context: { outputsDir: path.join(root, 'project', 'outputs') } }))
		).toThrow(/outside the sandbox mounts/);
	});

	it('refuses a workspaceDir that is not the mounted workspace', () => {
		expect(() => rewriter().rewrite(assign({ context: { workspaceDir: path.join(root, 'project') } }))).toThrow(
			/not the mounted workspaceDir/
		);
	});

	it('refuses a path with ..', () => {
		expect(() =>
			rewriter().rewrite(
				assign({ context: { outputsDir: `${path.join(root, 'ws.meta')}${path.sep}..${path.sep}x` } })
			)
		).toThrow(/\.\./);
	});

	// An absolute workingDir / flowWorkingDir is translated or refused on EVERY host: the rows for a Windows host and a POSIX host are in
	// AssignmentRewriter.platform.test.ts (platform parameter), not skipped here.
	it("translates the host's own absolute workingDir and flowWorkingDir inside the mounts, and refuses one outside", () => {
		const inside = path.join(root, 'ws', 'sub');
		fs.mkdirSync(inside);

		const { message } = rewriter().rewrite(
			assign({ step: { workingDir: inside }, context: { flowWorkingDir: inside } })
		);

		expect((message['stepConfig'] as JsonObject)['workingDir']).toBe(sandboxPath(inside));
		expect((message['executionContext'] as JsonObject)['flowWorkingDir']).toBe(sandboxPath(inside));
		expect(() => rewriter().rewrite(assign({ step: { workingDir: path.join(root, 'project') } }))).toThrow(
			/outside the sandbox mounts/
		);
	});

	it('passes a relative workingDir through', () => {
		const { message } = rewriter().rewrite(assign({ step: { workingDir: './sub' } }));

		expect((message['stepConfig'] as JsonObject)['workingDir']).toBe('./sub');
	});
});

describe('AssignmentRewriter environment', () => {
	it('merges the wrapper env into the step env and lets it win', () => {
		const { message } = rewriter().rewrite(assign({ step: { env: { OWN: '1', INJECTED: 'flow-value' } } }));

		expect((message['stepConfig'] as JsonObject)['env']).toEqual({ OWN: '1', INJECTED: 'yes', FOR_TYPE: 'script' });
		expect(log.text()).toContain('step env INJECTED is set by the sandbox wrapper');
	});

	it('asks for the env of the step type', () => {
		const { message, active } = rewriter().rewrite(assign({ step: { type: 'model', prompt: 'p' } }));

		expect((message['stepConfig'] as JsonObject)['env']).toMatchObject({ FOR_TYPE: 'model' });
		expect(active).toEqual({ assignmentId: 'a1', executionId: 'exec1', stepId: 'build', stepType: 'model' });
	});

	it('warns about Windows paths in env values and in script text, without rewriting them', () => {
		const { message } = rewriter().rewrite(
			assign({ step: { env: { OUT: 'C:\\temp\\x' }, script: 'cat C:\\data\\file.txt' } })
		);

		const step = message['stepConfig'] as JsonObject;
		expect((step['env'] as JsonObject)['OUT']).toBe('C:\\temp\\x');
		expect(step['script']).toBe('cat C:\\data\\file.txt');
		expect(log.text()).toContain('env OUT contains the Windows path');
		expect(log.text()).toContain('script line 1 contains the Windows path');
	});
});

describe('AssignmentRewriter step requirements and the host marker', () => {
	it('carries the message requires through, as a copy, and leaves it out when the daemon sent none', () => {
		const withRequires = { ...assign(), requires: ['sandbox', 'env=clean'] };

		const { message } = rewriter().rewrite(withRequires);
		expect(message['requires']).toEqual(['sandbox', 'env=clean']);
		expect(message['requires']).not.toBe(withRequires.requires);

		expect('requires' in rewriter().rewrite(assign()).message).toBe(false);
	});

	it('refuses a requires that is not a list of strings instead of dropping it', () =>
		eachRow(
			[
				['a string', 'sandbox'],
				['a list with a number', ['sandbox', 3]],
				['an object', { sandbox: true }],
			],
			(_name, requires) => {
				expect(() => rewriter().rewrite({ ...assign(), requires })).toThrow(/"requires"/);
			}
		));

	// The relay variant runs everything in the VM through an inner worker that cannot honour the marker: forwarding it would
	// silently run a step the flow author asked to run on the host in the VM.
	it('lets a step that spells the default out (host: false in the step, no marker on the message) through, the step keeps it', () => {
		const { message } = rewriter().rewrite(assign({ step: { host: false } }));

		expect((message['stepConfig'] as JsonObject)['host']).toBe(false);
		expect('host' in message).toBe(false);
	});

	it('refuses a host: true step (message or step), the exec wrapper is the one that serves it', () =>
		eachRow(
			[
				['on the message', { ...assign(), host: true }],
				['in the step', assign({ step: { host: true } })],
			],
			(_name, raw) => {
				expect(() => rewriter().rewrite(raw)).toThrow(/host: true[\s\S]*exec wrapper/);
			}
		));
});

describe('AssignmentRewriter validation', () => {
	it('refuses a (each case) step with the reason', () =>
		eachRow([['user_intervention'], ['subflow'], ['nonsense']], type => {
			expect(() => rewriter().rewrite(assign({ step: { type } }))).toThrow(/only "model" and "script" steps/);
		}));

	it('refuses a message that is (each case)', () =>
		eachRow(
			[
				['not an object', 'text'],
				['another type', { type: 'idle' }],
				['no assignmentId', { type: 'assign', stepId: 's', stepConfig: {}, executionContext: {} }],
				['no stepConfig', { type: 'assign', assignmentId: 'a', stepId: 's', executionContext: {} }],
			],
			(_name, raw) => {
				expect(() => rewriter().rewrite(raw)).toThrow(SandboxError);
			}
		));

	it('refuses an execution context without workspaceDir, naming the field', () => {
		const message = assign();
		delete (message['executionContext'] as JsonObject)['workspaceDir'];

		expect(() => rewriter().rewrite(message)).toThrow(/no workspaceDir/);
	});

	it('rebuilds the message: unknown top-level fields are not forwarded, other context fields are kept', () => {
		const raw = { ...assign({ context: { secrets: { TOKEN: 'v' }, flowId: 'f' } }), extra: 'x' };

		const { message } = rewriter().rewrite(raw);

		expect(Object.keys(message).sort()).toEqual([
			'assignmentId',
			'executionContext',
			'stepConfig',
			'stepId',
			'type',
		]);
		const context = message['executionContext'] as JsonObject;
		expect(context['secrets']).toEqual({ TOKEN: 'v' });
		expect(context['flowId']).toBe('f');
		expect(context['inputs']).toEqual({ name: 'x' });
	});
});

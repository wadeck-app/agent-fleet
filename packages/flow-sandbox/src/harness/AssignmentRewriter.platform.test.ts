import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { PureMounts } from '../testing/PureMounts';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { AssignmentRewriter } from './AssignmentRewriter';
import type { JsonObject } from './HarnessMessages';

/** Working directories for a Windows host and a POSIX host, on any machine: the platform is a parameter, the mounts are strings. */
interface Flavor {
	name: string;
	platform: NodeJS.Platform;
	workspace: string;
	meta: string;
	sep: string;
	outside: string;
	/** The sandbox form of a host path under the workspace. */
	toSandbox: (hostPath: string) => string;
}

const FLAVORS: Flavor[] = [
	{
		name: 'Windows host',
		platform: 'win32',
		workspace: 'C:\\runs\\ws',
		meta: 'C:\\runs\\ws.meta',
		sep: '\\',
		outside: 'C:\\project',
		toSandbox: hostPath => `/c${hostPath.slice(2).replaceAll('\\', '/')}`,
	},
	{
		name: 'POSIX host',
		platform: 'linux',
		workspace: '/work/ws',
		meta: '/work/ws.meta',
		sep: '/',
		outside: '/project',
		toSandbox: hostPath => hostPath,
	},
];

function rewriterFor(flavor: Flavor): AssignmentRewriter {
	return new AssignmentRewriter({
		mounts: new PureMounts(
			{ workspaceDir: flavor.workspace, workspaceMetaDir: flavor.meta },
			flavor.platform
		).asRunMounts(),
		injectedEnv: () => ({}),
		log: new RecordingSandboxLog(),
		platform: flavor.platform,
	});
}

function assign(flavor: Flavor, step: JsonObject = {}, context: JsonObject = {}): JsonObject {
	return {
		type: 'assign',
		assignmentId: 'a1',
		stepId: 'build',
		stepConfig: { id: 'build', type: 'script', script: 'echo hi', ...step },
		executionContext: {
			executionId: 'exec1',
			workspaceDir: flavor.workspace,
			outputsDir: `${flavor.meta}${flavor.sep}outputs`,
			cwd: flavor.workspace,
			...context,
		},
	};
}

describe.each(FLAVORS)('AssignmentRewriter working directories on a $name', flavor => {
	const rewriter = rewriterFor(flavor);
	const inside = [flavor.workspace, 'sub'].join(flavor.sep);
	const outside = [flavor.outside, 'sub'].join(flavor.sep);

	it('translates an absolute workingDir and flowWorkingDir inside the mounts', () => {
		const { message } = rewriter.rewrite(assign(flavor, { workingDir: inside }, { flowWorkingDir: inside }));

		expect((message['stepConfig'] as JsonObject)['workingDir']).toBe(flavor.toSandbox(inside));
		expect((message['executionContext'] as JsonObject)['flowWorkingDir']).toBe(flavor.toSandbox(inside));
	});

	it('refuses an absolute workingDir outside the mounts, naming it', () => {
		let error: unknown;
		try {
			rewriter.rewrite(assign(flavor, { workingDir: outside }));
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(SandboxError);
		expect((error as SandboxError).message).toContain(outside);
	});

	it('passes a relative workingDir through', () => {
		const { message } = rewriter.rewrite(assign(flavor, { workingDir: './sub' }));

		expect((message['stepConfig'] as JsonObject)['workingDir']).toBe('./sub');
	});
});

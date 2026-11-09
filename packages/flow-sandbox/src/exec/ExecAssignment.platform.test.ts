import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import type { JsonObject } from '../harness/HarnessMessages';
import { PureMounts } from '../testing/PureMounts';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { ExecAssignment } from './ExecAssignment';

/** Every case runs for a Windows host and a POSIX host on any machine: the platform is a parameter and the mounts are strings. */
interface Flavor {
	name: string;
	platform: NodeJS.Platform;
	workspace: string;
	meta: string;
	sep: string;
	outside: string;
}

const FLAVORS: Flavor[] = [
	{
		name: 'Windows host',
		platform: 'win32',
		workspace: 'C:\\runs\\ws',
		meta: 'C:\\runs\\ws.meta',
		sep: '\\',
		outside: 'C:\\elsewhere',
	},
	{
		name: 'POSIX host',
		platform: 'linux',
		workspace: '/work/ws',
		meta: '/work/ws.meta',
		sep: '/',
		outside: '/elsewhere',
	},
];

function assignmentFor(flavor: Flavor): ExecAssignment {
	return new ExecAssignment({
		mounts: new PureMounts(
			{ workspaceDir: flavor.workspace, workspaceMetaDir: flavor.meta },
			flavor.platform
		).asRunMounts(),
		injectedEnv: () => ({}),
		log: new RecordingSandboxLog(),
		platform: flavor.platform,
	});
}

function assign(flavor: Flavor, overrides: { step?: JsonObject; context?: JsonObject } = {}): JsonObject {
	return {
		type: 'assign',
		assignmentId: 'a1',
		stepId: 's1',
		stepConfig: { id: 's1', type: 'script', script: 'echo hi', ...overrides.step },
		executionContext: {
			executionId: 'e1',
			workspaceDir: flavor.workspace,
			outputsDir: `${flavor.meta}${flavor.sep}outputs`,
			cwd: flavor.workspace,
			...overrides.context,
		},
	};
}

describe.each(FLAVORS)('ExecAssignment working directories on a $name', flavor => {
	const assignment = assignmentFor(flavor);
	const under = (root: string, ...segments: string[]): string => [root, ...segments].join(flavor.sep);

	it('refuses an absolute workingDir or flowWorkingDir outside the mounts', () => {
		for (const raw of [
			assign(flavor, { step: { workingDir: under(flavor.outside, 'sub') } }),
			assign(flavor, { context: { flowWorkingDir: under(flavor.outside, 'sub') } }),
		]) {
			let error: unknown;
			try {
				assignment.prepare(raw);
			} catch (caught) {
				error = caught;
			}
			expect(error).toBeInstanceOf(SandboxError);
			expect((error as SandboxError).kind).toBe('path-outside-mounts');
		}
	});

	it('accepts an absolute workingDir inside the mounts and a relative one, and keeps them as written', () => {
		const inside = under(flavor.workspace, 'sub');

		expect(assignment.prepare(assign(flavor, { step: { workingDir: inside } })).stepConfig['workingDir']).toBe(
			inside
		);
		expect(assignment.prepare(assign(flavor, { step: { workingDir: 'sub' } })).stepConfig['workingDir']).toBe(
			'sub'
		);
	});

	it('replaces a cwd outside the mounts by the workspace', () => {
		const prepared = assignment.prepare(assign(flavor, { context: { cwd: under(flavor.outside, 'project') } }));

		expect(prepared.executionContext['cwd']).toBe(flavor.workspace);
	});
});

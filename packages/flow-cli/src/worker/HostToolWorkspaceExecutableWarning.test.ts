import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ResolvedHostExecutable } from './HostToolExecutableResolver';
import { HostToolWorkspaceExecutableWarning } from './HostToolWorkspaceExecutableWarning';

const executable = (toolId: string, absolutePath: string): ResolvedHostExecutable => ({
	toolId,
	command: absolutePath,
	absolutePath,
	size: 1,
	mtimeMs: 1,
});

const find = (executables: Array<[string, string]>, workspaceDir: string, platform: NodeJS.Platform): string[] =>
	HostToolWorkspaceExecutableWarning.find({
		stepId: 'triage',
		executables: new Map(executables.map(([toolId, file]) => [toolId, executable(toolId, file)])),
		workspaceDir,
		platform,
	});

describe('HostToolWorkspaceExecutableWarning', () => {
	describe('which paths are inside the workspace (paths that need not exist)', () => {
		const WORKSPACE = '/runs/ws-1';
		it.each([
			{
				name: 'a file directly in the workspace',
				file: `${WORKSPACE}/tool`,
				platform: 'linux',
				warns: true,
			},
			{
				name: 'a file in a nested directory',
				file: `${WORKSPACE}/a/b/tool`,
				platform: 'linux',
				warns: true,
			},
			{
				name: 'a path with a dot-dot segment that comes back in',
				file: `${WORKSPACE}/x/../tool`,
				platform: 'linux',
				warns: true,
			},
			{
				name: 'a sibling whose name starts like the workspace',
				file: '/runs/ws-10/tool',
				platform: 'linux',
				warns: false,
			},
			{ name: 'the parent of the workspace', file: '/runs/tool', platform: 'linux', warns: false },
			{
				name: 'a different case on POSIX (a different directory)',
				file: '/runs/WS-1/tool',
				platform: 'linux',
				warns: false,
			},
			{
				name: 'a different case on Windows (the same directory)',
				file: '/runs/WS-1/tool',
				platform: 'win32',
				warns: true,
			},
		] as const)('$name -> warns=$warns', ({ file, platform, warns }) => {
			expect(find([['show', file]], WORKSPACE, platform)).toHaveLength(warns ? 1 : 0);
		});
	});

	it('names the tool id, the path and why, with a Fix line, once per tool', () => {
		const workspace = '/runs/ws-1';
		const inside = `${workspace}/bin/tool`;
		const lines = find(
			[
				['alpha', inside],
				['beta', inside],
				['gamma', '/usr/bin/tool'],
			],
			workspace,
			'linux'
		);
		expect(lines).toHaveLength(2);
		for (const [index, toolId] of ['alpha', 'beta'].entries()) {
			const line = lines[index]!;
			expect(line).toMatch(/^\[host-tool\] WARNING /);
			expect(line).toContain(`Step 'triage' tool '${toolId}'`);
			expect(line).toContain(inside);
			expect(line).toContain(workspace);
			expect(line).toMatch(/model can write the workspace/);
			expect(line).toMatch(/Fix: use an executable outside the workspace\./);
			expect(line).not.toMatch(/[\r\n]/);
		}
	});

	describe('real paths (a symlinked directory pointing into the workspace)', () => {
		let root: string;
		beforeAll(() => {
			root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-warning-'));
			fs.mkdirSync(path.join(root, 'ws'));
			fs.writeFileSync(path.join(root, 'ws', 'tool'), 'x');
			try {
				fs.symlinkSync(path.join(root, 'ws'), path.join(root, 'alias'), 'junction');
			} catch (error) {
				// Creating a link may be refused (Windows without the privilege): the test then states it, it does not pass silently.
				throw new Error(
					`Cannot create the directory link this test needs: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		});
		afterAll(() => {
			fs.rmSync(root, { recursive: true, force: true });
		});

		it('an executable reached through an alias of the workspace is inside it', () => {
			expect(
				find([['show', path.join(root, 'alias', 'tool')]], path.join(root, 'ws'), process.platform)
			).toHaveLength(1);
		});

		it('the workspace given through the alias contains the real file too', () => {
			expect(
				find([['show', path.join(root, 'ws', 'tool')]], path.join(root, 'alias'), process.platform)
			).toHaveLength(1);
		});
	});
});

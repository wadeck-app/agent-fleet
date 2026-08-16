import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { ApprovalProvider, ApprovalRequest, ChoiceRequest, InputRequest } from './approval/v1.js';
import type { WorkspaceHandle, WorkspaceProvider, WorkspaceRequest } from './workspace/v1.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPointsJson = JSON.parse(readFileSync(join(__dirname, '..', 'extension-points.json'), 'utf8')) as {
	extensionPoints: Array<{
		id: string;
		status: string;
		description: string;
		versions: Array<{ version: number; status: string; since?: string }>;
	}>;
};

describe('extension-points interfaces compile correctly', () => {
	it('WorkspaceProvider shape is satisfied by a mock implementation', () => {
		const mockHandle: WorkspaceHandle = { path: '/tmp/ws', id: 'none:task-1' };
		const provider: WorkspaceProvider = {
			async allocate(_req: WorkspaceRequest): Promise<WorkspaceHandle> {
				return mockHandle;
			},
			async release(_handle: WorkspaceHandle): Promise<void> {
				// no-op
			},
		};

		expect(provider).toBeDefined();
		expect(mockHandle.path).toBe('/tmp/ws');
		expect(mockHandle.id).toBe('none:task-1');
	});

	it('WorkspaceRequest allows optional hint', () => {
		const withHint: WorkspaceRequest = { taskId: 'task-1', hint: 'my-prefix' };
		const withoutHint: WorkspaceRequest = { taskId: 'task-2' };
		expect(withHint.taskId).toBe('task-1');
		expect(withoutHint.hint).toBeUndefined();
	});

	it('ApprovalProvider shape is satisfied by a mock implementation', () => {
		const provider: ApprovalProvider = {
			async requestInput(_req: InputRequest): Promise<string> {
				return 'user input';
			},
			async requestChoice(_req: ChoiceRequest): Promise<string> {
				return 'choice-a';
			},
			async requestApproval(_req: ApprovalRequest): Promise<boolean> {
				return true;
			},
		};

		expect(provider).toBeDefined();
	});

	it('ChoiceRequest allows choices with optional description', () => {
		const req: ChoiceRequest = {
			taskId: 'task-1',
			stepId: 'step-1',
			prompt: 'Pick one',
			choices: [
				{ id: 'a', label: 'Option A' },
				{ id: 'b', label: 'Option B', description: 'The second option' },
			],
		};

		expect(req.choices).toHaveLength(2);
		expect(req.choices[0]!.description).toBeUndefined();
		expect(req.choices[1]!.description).toBe('The second option');
	});

	it('ApprovalRequest allows optional context', () => {
		const withContext: ApprovalRequest = { taskId: 't', stepId: 's', prompt: 'OK?', context: 'diff output' };
		const withoutContext: ApprovalRequest = { taskId: 't', stepId: 's', prompt: 'OK?' };
		expect(withContext.context).toBe('diff output');
		expect(withoutContext.context).toBeUndefined();
	});
});

describe('extension-points.json registry is valid', () => {
	it('has extensionPoints array', () => {
		expect(Array.isArray(extensionPointsJson.extensionPoints)).toBe(true);
		expect(extensionPointsJson.extensionPoints.length).toBeGreaterThan(0);
	});

	it('each entry has required fields: id, status, description, versions', () => {
		for (const ep of extensionPointsJson.extensionPoints) {
			expect(typeof ep.id).toBe('string');
			expect(ep.id.length).toBeGreaterThan(0);
			expect(typeof ep.status).toBe('string');
			expect(typeof ep.description).toBe('string');
			expect(Array.isArray(ep.versions)).toBe(true);
		}
	});

	it('stable extension points have at least one version', () => {
		for (const ep of extensionPointsJson.extensionPoints) {
			if (ep.status === 'stable') {
				expect(ep.versions.length).toBeGreaterThan(0);
			}
		}
	});

	it('version entries have version (number) and status fields', () => {
		for (const ep of extensionPointsJson.extensionPoints) {
			for (const v of ep.versions) {
				expect(typeof v.version).toBe('number');
				expect(typeof v.status).toBe('string');
			}
		}
	});

	it('workspace extension point is stable at version 1', () => {
		const ws = extensionPointsJson.extensionPoints.find(ep => ep.id === 'workspace');
		expect(ws).toBeDefined();
		expect(ws!.status).toBe('stable');
		expect(ws!.versions.some(v => v.version === 1 && v.status === 'stable')).toBe(true);
	});

	it('approval extension point is stable at version 1', () => {
		const ap = extensionPointsJson.extensionPoints.find(ep => ep.id === 'approval');
		expect(ap).toBeDefined();
		expect(ap!.status).toBe('stable');
		expect(ap!.versions.some(v => v.version === 1 && v.status === 'stable')).toBe(true);
	});

	it('IDs are unique', () => {
		const ids = extensionPointsJson.extensionPoints.map(ep => ep.id);
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});
});

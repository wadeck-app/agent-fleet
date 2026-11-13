import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { ApprovalProvider, ApprovalRequest, ChoiceRequest, InputRequest } from './approval/v1.js';
import type { PluginManifest } from './manifest.js';
import type { StepDistributionProvider } from './step-distribution/v1.js';
import type {
	StepPlacement,
	WorkerAcceptanceProvider,
	WorkerAcceptanceRequest,
	WorkerCandidate,
} from './worker-acceptance/v1.js';
import type { RunEndEvent, WorkerTypeFactory, WorkerTypeInstance } from './worker-type/v1.js';
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
		const base = { projectDir: '/p', flow: { id: 'f', version: '1.0.0' } };
		const withHint: WorkspaceRequest = { taskId: 'task-1', executionId: 'task-1', hint: 'my-prefix', ...base };
		const withoutHint: WorkspaceRequest = { taskId: 'task-2', executionId: 'task-2', ...base };
		expect(withHint.taskId).toBe('task-1');
		expect(withoutHint.hint).toBeUndefined();
	});

	it('WorkspaceRequest accepts the optional onWaiting and signal', () => {
		const messages: string[] = [];
		const request: WorkspaceRequest = {
			taskId: 't',
			executionId: 't',
			projectDir: '/p',
			flow: { id: 'f', version: '1.0.0' },
			onWaiting: info => messages.push(info.message),
			signal: new AbortController().signal,
		};
		request.onWaiting?.({ message: 'all slots are claimed' });
		expect(messages).toEqual(['all slots are claimed']);
	});

	it('WorkspaceHandle accepts the optional metaDir, readOnly and notes', () => {
		const minimal: WorkspaceHandle = { path: '/tmp/ws', id: 'x' };
		const full: WorkspaceHandle = {
			path: '/tmp/ws',
			id: 'x',
			metaDir: '/tmp/meta',
			readOnly: true,
			notes: ['dirty'],
		};
		expect(minimal.metaDir).toBeUndefined();
		expect(full.notes).toEqual(['dirty']);
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

	it('WorkerAcceptanceProvider shape is satisfied by a mock implementation', () => {
		const provider: WorkerAcceptanceProvider = {
			accepts: ({ step, worker }: WorkerAcceptanceRequest) => worker.labels.includes(step.labels[0] ?? ''),
		};
		const worker: WorkerCandidate = {
			workerId: 'w1',
			labels: ['gpu'],
			attachedProjectIds: ['proj0001'],
			attachedProjects: ['C:/proj'],
			hasUserInterface: true,
			ephemeral: false,
			shellCapabilities: [],
		};
		const step: StepPlacement = { stepId: 's1', labels: ['gpu'], requiresUserInterface: false };

		expect(provider.accepts({ step, worker })).toBe(true);
	});

	// The contract that keeps a preference from becoming a cap (D#24).
	it('StepDistributionProvider returns the candidates it was given', () => {
		const provider: StepDistributionProvider = {
			order: candidates => [...candidates].reverse(),
		};
		const candidates: WorkerCandidate[] = ['a', 'b'].map(workerId => ({
			workerId,
			labels: [],
			attachedProjectIds: [],
			attachedProjects: [],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [],
		}));

		expect(provider.order(candidates).map(candidate => candidate.workerId)).toEqual(['b', 'a']);
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

	it('worker-type extension point is registered at version 1', () => {
		const wt = extensionPointsJson.extensionPoints.find(ep => ep.id === 'worker-type');
		expect(wt).toBeDefined();
		expect(wt!.versions.some(v => v.version === 1 && v.status === 'stable')).toBe(true);
	});

	it('IDs are unique', () => {
		const ids = extensionPointsJson.extensionPoints.map(ep => ep.id);
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});
});

describe('worker-type v1 shape', () => {
	it('a factory builds an instance composing a v1 worker source, an optional run hook and a dispose', async () => {
		const ended: RunEndEvent[] = [];
		const factory: WorkerTypeFactory = async () => ({
			source: {
				async obtainWorker(): Promise<void> {
					// no-op
				},
			},
			run: {
				async onRunEnded(event: RunEndEvent): Promise<void> {
					ended.push(event);
				},
			},
			async dispose(): Promise<void> {
				// no-op
			},
		});

		const instance: WorkerTypeInstance = await factory({ sourceId: 'sbx', options: {} });
		await instance.run?.onRunEnded({ executionId: 'e1', reason: 'completed' });

		expect(ended).toEqual([{ executionId: 'e1', reason: 'completed' }]);
	});

	it('exclusive is optional and boolean', () => {
		const plain: WorkerTypeInstance = {
			source: { obtainWorker: async () => undefined },
			dispose: async () => undefined,
		};
		const exclusive: WorkerTypeInstance = { ...plain, exclusive: true };
		expect([plain.exclusive, exclusive.exclusive]).toEqual([undefined, true]);
	});

	it('run is optional', async () => {
		const instance: WorkerTypeInstance = {
			source: { obtainWorker: async () => undefined },
			dispose: async () => undefined,
		};
		expect(instance.run).toBeUndefined();
	});
});

describe('worker-type v1 guarantees (additive field)', () => {
	it('an instance may list the guarantees its workers enforce, and an old instance need not', () => {
		const old: WorkerTypeInstance = {
			source: { obtainWorker: async () => undefined },
			dispose: async () => undefined,
		};
		const confined: WorkerTypeInstance = { ...old, guarantees: ['fs=confined', 'sandbox'] };
		expect([old.guarantees, confined.guarantees]).toEqual([undefined, ['fs=confined', 'sandbox']]);
	});

	it('a manifest implementation declares the guarantees statically, next to its version', () => {
		const manifest: PluginManifest = {
			pluginId: 'sbx',
			manifestVersion: '1',
			implementations: { 'worker-type': { docker: { version: 1, guarantees: ['fs=confined'] } } },
		};
		expect(manifest.implementations['worker-type']?.['docker']?.guarantees).toEqual(['fs=confined']);
	});

	it('a step placement carries the resolved requirements, optional', () => {
		const placement: StepPlacement = {
			stepId: 's',
			labels: [],
			requiresUserInterface: false,
			requires: ['fs=confined'],
		};
		expect(placement.requires).toEqual(['fs=confined']);
	});
});

describe('worker-type v1 options (additive manifest field)', () => {
	it('a manifest implementation declares the option names a source accepts, and an older one need not', () => {
		const manifest: PluginManifest = {
			pluginId: 'sbx',
			manifestVersion: '1',
			implementations: {
				'worker-type': {
					exec: { version: 1, options: ['projects', 'image'] },
					legacy: { version: 1 },
				},
			},
		};
		expect([
			manifest.implementations['worker-type']?.['exec']?.options,
			manifest.implementations['worker-type']?.['legacy']?.options,
		]).toEqual([['projects', 'image'], undefined]);
	});
});

describe('worker-type v1 workspaces (additive field)', () => {
	it('an instance may narrow the workspace provider kinds it accepts, and an old instance need not', () => {
		const old: WorkerTypeInstance = {
			source: { obtainWorker: async () => undefined },
			dispose: async () => undefined,
		};
		const poolOnly: WorkerTypeInstance = { ...old, workspaces: ['pool'] };
		expect([old.workspaces, poolOnly.workspaces]).toEqual([undefined, ['pool']]);
	});

	it('a manifest implementation declares the accepted workspace kinds statically, next to its guarantees', () => {
		const manifest: PluginManifest = {
			pluginId: 'sbx',
			manifestVersion: '1',
			implementations: {
				'worker-type': { docker: { version: 1, guarantees: ['sandbox'], workspaces: ['pool'] } },
			},
		};
		expect(manifest.implementations['worker-type']?.['docker']?.workspaces).toEqual(['pool']);
	});

	it('a step placement carries the kind of the workspace of its run, optional', () => {
		const placement: StepPlacement = {
			stepId: 's',
			labels: [],
			requiresUserInterface: false,
			workspaceKind: 'in-place',
		};
		expect(placement.workspaceKind).toBe('in-place');
	});
});

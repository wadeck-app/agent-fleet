/**
 * A flow declares where it runs with `workspace:` (a provider name or `{ provider, ...options }`). A missing or legacy
 * declaration is an error that names the providers, so the author knows what to write.
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SchemaValidator } from './SchemaValidator';
import { ValidationCode } from './ValidationTypes';

let collector: MockIssueCollector;
let validator: SchemaValidator;

beforeEach(() => {
	collector = new MockIssueCollector();
	validator = new SchemaValidator(collector);
});

function flowWith(workspace: unknown, steps: unknown[] = [{ type: 'script', id: 's1', name: 'S1', script: 'echo' }]) {
	const flow: Record<string, unknown> = {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		inputs: {},
		steps,
	};
	if (workspace !== undefined) {
		flow['workspace'] = workspace;
	}
	return flow as unknown as FlowDefinition;
}

function workspaceIssues() {
	return collector.issues.filter(i => i.location?.field?.startsWith('workspace'));
}

describe('SchemaValidator - workspace declaration', () => {
	it('errors when the flow has no workspace and names the providers and an example', () => {
		validator.validateSchema(flowWith(undefined));

		const [issue] = workspaceIssues();
		expect(workspaceIssues()).toHaveLength(1);
		expect(issue!.severity).toBe('error');
		expect(issue!.code).toBe(ValidationCode.MISSING_FIELD);
		expect(issue!.suggestion).toContain('in-place');
		expect(issue!.suggestion).toContain('workspace: in-place');
	});

	it('accepts the deprecated plugins.workspace when there is no workspace, with a warning', () => {
		const flow = flowWith(undefined) as unknown as Record<string, unknown>;
		flow['plugins'] = { workspace: { use: 'my-instance' } };

		validator.validateSchema(flow as unknown as FlowDefinition);

		const issues = collector.issues.filter(i => i.location?.field === 'plugins.workspace');
		expect(issues.map(i => i.severity)).toEqual(['warning']);
		expect(workspaceIssues().filter(i => i.severity === 'error')).toEqual([]);
	});

	it.each(['in-place', 'readonly', 'pool', 'my-instance'])('accepts the name %s', name => {
		validator.validateSchema(flowWith(name));

		expect(workspaceIssues()).toEqual([]);
	});

	it('accepts the object form', () => {
		validator.validateSchema(flowWith({ provider: 'pool', dir: 'D:/pool', prefix: 'ws-', count: 2 }));

		expect(workspaceIssues()).toEqual([]);
	});

	it('accepts mode: manual with a deprecation warning that gives the rewrite', () => {
		validator.validateSchema(flowWith({ mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' }));

		const issues = workspaceIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]!.severity).toBe('warning');
		expect(issues[0]!.message).toContain('workspace: in-place');
	});

	it('warns for the "none" alias', () => {
		validator.validateSchema(flowWith('none'));

		expect(workspaceIssues().map(i => i.severity)).toEqual(['warning']);
	});

	it('errors for a removed clone block, with the rewrite hint', () => {
		validator.validateSchema(flowWith({ mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' }));

		const [issue] = workspaceIssues();
		expect(issue!.severity).toBe('error');
		expect(issue!.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issue!.location?.field).toBe('workspace.mode');
		expect(issue!.suggestion).toContain('worktree');
	});

	it('errors for a number', () => {
		validator.validateSchema(flowWith(3));

		expect(workspaceIssues()[0]!.severity).toBe('error');
	});

	describe('worktree options', () => {
		const issuesFor = (workspace: unknown) => {
			validator.validateSchema(flowWith(workspace));
			return workspaceIssues().filter(i => i.severity === 'error');
		};

		it('accepts baseDir with a plain prefix', () => {
			expect(issuesFor({ provider: 'worktree', baseDir: '../worktrees', prefix: 'flow-' })).toEqual([]);
		});

		it('rejects a prefix with a path separator, as the run would, naming the characters allowed', () => {
			const [issue] = issuesFor({ provider: 'worktree', baseDir: '../w', prefix: 'fleet/' });

			expect(issue!.location?.field).toBe('workspace.prefix');
			expect(issue!.message).toContain('fleet/');
			expect(issue!.message).toContain('letters, digits');
		});

		it('requires baseDir', () => {
			const [issue] = issuesFor({ provider: 'worktree', prefix: 'flow-' });

			expect(issue!.code).toBe(ValidationCode.MISSING_FIELD);
			expect(issue!.location?.field).toBe('workspace.baseDir');
		});

		it('names an option the provider does not know, with the accepted ones', () => {
			const [issue] = issuesFor({ provider: 'worktree', baseDir: '../w', dir: 'x' });

			expect(issue!.location?.field).toBe('workspace.dir');
			expect(issue!.suggestion).toContain('baseDir');
		});

		it('does not check the options of a provider it does not know', () => {
			expect(issuesFor({ provider: 'my-instance', whatever: 1 })).toEqual([]);
		});
	});

	describe('read-only workspace and writing tools', () => {
		const writer = {
			type: 'model',
			id: 'impl',
			name: 'Impl',
			model: 'sonnet',
			prompt: 'p',
			tools: ['read', 'edit'],
		};

		it('errors when a model step of a readonly flow declares a writing tool, naming the step', () => {
			validator.validateSchema(flowWith('readonly', [writer]));

			const issue = collector.issues.find(i => i.code === ValidationCode.WORKSPACE_READONLY_CONFLICT);
			expect(issue).toBeDefined();
			expect(issue!.severity).toBe('error');
			expect(issue!.message).toContain("'impl' (edit)");
			expect(issue!.suggestion).toContain('tools');
		});

		it('also applies to the object form of readonly', () => {
			validator.validateSchema(flowWith({ provider: 'readonly', dir: '/x' }, [writer]));

			expect(collector.issues.some(i => i.code === ValidationCode.WORKSPACE_READONLY_CONFLICT)).toBe(true);
		});

		it('does not apply to other providers', () => {
			validator.validateSchema(flowWith('in-place', [writer]));

			expect(collector.issues.some(i => i.code === ValidationCode.WORKSPACE_READONLY_CONFLICT)).toBe(false);
		});
	});
});

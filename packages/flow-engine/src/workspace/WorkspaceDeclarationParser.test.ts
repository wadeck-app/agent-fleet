import { describe, expect, it } from 'vitest';

import { WorkspaceDeclarationParser } from './WorkspaceDeclarationParser';

function expectSpec(declaration: unknown) {
	const result = WorkspaceDeclarationParser.parse(declaration);
	if (!result.ok) {
		throw new Error(`expected a workspace spec, got: ${result.issues.map(i => i.message).join(' | ')}`);
	}
	return result;
}

function expectIssues(declaration: unknown) {
	const result = WorkspaceDeclarationParser.parse(declaration);
	if (result.ok) {
		throw new Error(`expected issues, got the spec ${JSON.stringify(result.spec)}`);
	}
	return result.issues;
}

describe('WorkspaceDeclarationParser', () => {
	describe('no declaration', () => {
		it.each([undefined, null])('refuses %s and names the providers and an example', declaration => {
			const [issue] = expectIssues(declaration);

			expect(issue!.field).toBe('workspace');
			expect(issue!.message).toContain('workspace');
			expect(issue!.suggestion).toContain('in-place');
			expect(issue!.suggestion).toContain('pool');
			expect(issue!.suggestion).toContain('readonly');
			expect(issue!.suggestion).toContain('worktree');
			expect(issue!.suggestion).toContain('workspace: in-place');
		});
	});

	describe('name only', () => {
		it('reads a provider name', () => {
			expect(expectSpec('readonly').spec).toEqual({ provider: 'readonly', options: {} });
		});

		it('trims the name', () => {
			expect(expectSpec('  pool ').spec.provider).toBe('pool');
		});

		it('refuses an empty name', () => {
			expect(expectIssues('  ')[0]!.field).toBe('workspace');
		});

		it('maps the alias "none" to in-place with a deprecation warning', () => {
			const result = expectSpec('none');

			expect(result.spec).toEqual({ provider: 'in-place', options: {} });
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain('"none"');
			expect(result.warnings[0]).toContain('in-place');
		});

		it('has no warning for a built-in name', () => {
			expect(expectSpec('in-place').warnings).toEqual([]);
		});
	});

	describe('object form', () => {
		it('separates the provider from its options', () => {
			const result = expectSpec({ provider: 'pool', dir: 'D:/pool', prefix: 'repo-ws-', count: 4 });

			expect(result.spec).toEqual({
				provider: 'pool',
				options: { dir: 'D:/pool', prefix: 'repo-ws-', count: 4 },
			});
		});

		it('refuses a provider that is not a non-empty string', () => {
			expect(expectIssues({ provider: 3 })[0]!.field).toBe('workspace.provider');
			expect(expectIssues({ provider: '' })[0]!.field).toBe('workspace.provider');
		});

		it('refuses an object with neither provider nor legacy mode, naming the providers', () => {
			const [issue] = expectIssues({ dir: 'x' });

			expect(issue!.field).toBe('workspace.provider');
			expect(issue!.suggestion).toContain('in-place');
		});

		it('refuses an array', () => {
			expect(expectIssues(['in-place'])[0]!.field).toBe('workspace');
		});

		it('refuses a number', () => {
			expect(expectIssues(3)[0]!.field).toBe('workspace');
		});
	});

	describe('legacy block', () => {
		it('maps mode: manual to in-place with a deprecation warning, ignoring the other legacy keys', () => {
			const result = expectSpec({
				mode: 'manual',
				gitStrategy: 'any',
				reusePolicy: 'if-available',
				concurrencyKey: 'k',
			});

			expect(result.spec).toEqual({ provider: 'in-place', options: {} });
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toContain('mode: manual');
			expect(result.warnings[0]).toContain('workspace: in-place');
		});

		it('refuses mode: isolated with a worktree strategy and hints at the worktree provider', () => {
			const [issue] = expectIssues({ mode: 'isolated', gitStrategy: 'worktree', reusePolicy: 'never' });

			expect(issue!.field).toBe('workspace.mode');
			expect(issue!.message).toContain('isolated');
			expect(issue!.suggestion).toContain('provider: worktree');
			expect(issue!.suggestion).toContain('baseDir');
		});

		it.each(['main-only', 'any', 'feature-branch'])(
			'refuses mode: isolated with the clone strategy %s and hints at worktree or pool',
			gitStrategy => {
				const [issue] = expectIssues({ mode: 'isolated', gitStrategy, reusePolicy: 'never' });

				expect(issue!.message).toContain(gitStrategy);
				expect(issue!.message).toContain('removed');
				expect(issue!.suggestion).toContain('worktree');
				expect(issue!.suggestion).toContain('pool');
			}
		);

		it('refuses mode: isolated with gitStrategy: none and says it was an empty directory', () => {
			const [issue] = expectIssues({ mode: 'isolated', gitStrategy: 'none' });

			expect(issue!.message).toContain('empty directory');
		});

		it('refuses mode: isolated without a strategy (the old default was a clone)', () => {
			const [issue] = expectIssues({ mode: 'isolated' });

			expect(issue!.message).toContain('removed');
			expect(issue!.suggestion).toContain('worktree');
		});

		it('refuses mode: shared and points to pool', () => {
			const [issue] = expectIssues({ mode: 'shared', gitStrategy: 'main-only', reusePolicy: 'always' });

			expect(issue!.field).toBe('workspace.mode');
			expect(issue!.message).toContain('shared');
			expect(issue!.suggestion).toContain('pool');
			expect(issue!.suggestion).toContain('count');
		});

		it('refuses an unknown mode and lists what is accepted now', () => {
			const [issue] = expectIssues({ mode: 'weird' });

			expect(issue!.message).toContain('weird');
			expect(issue!.suggestion).toContain('in-place');
		});

		it('refuses legacy keys without a mode', () => {
			const issues = expectIssues({ gitStrategy: 'main-only' });

			expect(issues[0]!.field).toBe('workspace.gitStrategy');
			expect(issues[0]!.message).toContain('removed');
		});

		it('refuses to mix provider and legacy mode', () => {
			const [issue] = expectIssues({ provider: 'pool', mode: 'manual' });

			expect(issue!.field).toBe('workspace.mode');
			expect(issue!.message).toContain('provider');
		});
	});
});

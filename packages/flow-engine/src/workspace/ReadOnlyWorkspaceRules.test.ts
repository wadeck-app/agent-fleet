import { describe, expect, it } from 'vitest';

import type { FlowStep } from '../types';
import { ReadOnlyWorkspaceRules } from './ReadOnlyWorkspaceRules';

function model(id: string, tools?: string[]): FlowStep {
	return { id, name: id, type: 'model', model: 'sonnet', prompt: 'p', ...(tools ? { tools } : {}) } as FlowStep;
}

function script(id: string): FlowStep {
	return { id, name: id, type: 'script', script: 'echo' } as FlowStep;
}

describe('ReadOnlyWorkspaceRules', () => {
	describe('findWritingSteps', () => {
		it('finds nothing when no model step declares tools', () => {
			expect(ReadOnlyWorkspaceRules.findWritingSteps([model('a'), script('b')])).toEqual([]);
		});

		it('finds nothing for read-only tools', () => {
			expect(ReadOnlyWorkspaceRules.findWritingSteps([model('a', ['read', 'glob', 'grep'])])).toEqual([]);
		});

		it.each(['write', 'edit', 'bash'])('flags a model step declaring %s', tool => {
			expect(ReadOnlyWorkspaceRules.findWritingSteps([model('a', ['read', tool])])).toEqual([
				{ stepId: 'a', tools: [tool] },
			]);
		});

		it('lists every writing tool of every writing step, in step order', () => {
			const found = ReadOnlyWorkspaceRules.findWritingSteps([
				model('a', ['bash', 'edit']),
				model('ok', ['read']),
				model('b', ['write']),
			]);

			expect(found).toEqual([
				{ stepId: 'a', tools: ['bash', 'edit'] },
				{ stepId: 'b', tools: ['write'] },
			]);
		});

		it('ignores script steps', () => {
			expect(ReadOnlyWorkspaceRules.findWritingSteps([script('s')])).toEqual([]);
		});
	});

	describe('describeConflict', () => {
		it('names the steps, the tools and the fix', () => {
			const text = ReadOnlyWorkspaceRules.describeConflict([
				{ stepId: 'impl', tools: ['edit', 'bash'] },
				{ stepId: 'fix', tools: ['write'] },
			]);

			expect(text.message).toContain("'impl' (edit, bash)");
			expect(text.message).toContain("'fix' (write)");
			expect(text.message).toContain('read-only');
			expect(text.suggestion).toContain('tools');
			expect(text.suggestion).toContain('worktree');
			expect(text.suggestion).toContain('pool');
		});
	});

	describe('defaultTools', () => {
		it('is read, glob, grep: bash is excluded because it can write', () => {
			expect(ReadOnlyWorkspaceRules.DEFAULT_TOOLS).toEqual(['read', 'glob', 'grep']);
		});
	});

	describe('promptNote', () => {
		it('tells the model that the workspace is shared and read-only', () => {
			expect(ReadOnlyWorkspaceRules.PROMPT_NOTE).toContain('shared and read-only');
			expect(ReadOnlyWorkspaceRules.PROMPT_NOTE).toContain('do not modify');
		});
	});

	describe('apply', () => {
		it('gives the default tools to a model step without tools and appends the note to its prompt', () => {
			const [step] = ReadOnlyWorkspaceRules.apply([model('a')]);

			expect((step as { tools?: string[] }).tools).toEqual(['read', 'glob', 'grep']);
			expect((step as { prompt: string }).prompt).toContain('p');
			expect((step as { prompt: string }).prompt).toContain(ReadOnlyWorkspaceRules.PROMPT_NOTE);
		});

		it('keeps the declared tools of a step', () => {
			const [step] = ReadOnlyWorkspaceRules.apply([model('a', ['read'])]);

			expect((step as { tools?: string[] }).tools).toEqual(['read']);
		});

		it('sets GIT_OPTIONAL_LOCKS=0 on every model and script step, keeping the step env (the step wins)', () => {
			const withEnv = { ...script('s'), env: { A: '1' } } as FlowStep;
			const own = { ...script('t'), env: { GIT_OPTIONAL_LOCKS: '1' } } as FlowStep;

			const [first, second, third] = ReadOnlyWorkspaceRules.apply([withEnv, own, model('m')]);

			expect((first as { env?: Record<string, string> }).env).toEqual({ GIT_OPTIONAL_LOCKS: '0', A: '1' });
			expect((second as { env?: Record<string, string> }).env).toEqual({ GIT_OPTIONAL_LOCKS: '1' });
			expect((third as { env?: Record<string, string> }).env).toEqual({ GIT_OPTIONAL_LOCKS: '0' });
		});

		it('leaves a step that asks the user untouched', () => {
			const ask = { id: 'q', name: 'q', type: 'user_intervention', interventionType: 'approval' } as FlowStep;

			const [step] = ReadOnlyWorkspaceRules.apply([ask]);

			expect(step).toBe(ask);
		});

		it('does not touch the prompt of a script step and does not mutate its input', () => {
			const original = script('s');
			const [step] = ReadOnlyWorkspaceRules.apply([original]);

			expect(step).not.toBe(original);
			expect((original as { env?: unknown }).env).toBeUndefined();
			expect((step as { prompt?: unknown }).prompt).toBeUndefined();
		});
	});
});

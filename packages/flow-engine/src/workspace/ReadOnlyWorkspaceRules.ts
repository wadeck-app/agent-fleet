import type { FlowStep } from '../types';

/** A model step that asks for a tool able to modify the workspace. */
export interface WritingStep {
	stepId: string;
	/** The writing tools it declares, in the order it declares them. */
	tools: string[];
}

const WRITING_TOOLS: ReadonlySet<string> = new Set(['write', 'edit', 'bash']);

/**
 * What a read-only workspace asks of the steps that run in it. Advisory: it conveys intent and refuses the flows that
 * contradict it, it enforces nothing (a script step still has the user's rights).
 */
export class ReadOnlyWorkspaceRules {
	/** Tools of a model step that declares none. `bash` is left out on purpose: it can write. */
	static readonly DEFAULT_TOOLS = ['read', 'glob', 'grep'] as const;

	/** Appended to the prompt of model steps. */
	static readonly PROMPT_NOTE =
		'Note: this workspace is shared and read-only; do not modify files in it (no writes, no edits, no commands that change it).';

	/** The model steps that declare `write`, `edit` or `bash`. */
	static findWritingSteps(steps: readonly FlowStep[]): WritingStep[] {
		const found: WritingStep[] = [];
		for (const step of steps) {
			if (step.type !== 'model') {
				continue;
			}
			const tools = (step.tools ?? []).filter(tool => WRITING_TOOLS.has(tool));
			if (tools.length > 0) {
				found.push({ stepId: step.id, tools });
			}
		}
		return found;
	}

	/** Words for a refusal: what is wrong, and what to do about it. */
	static describeConflict(writing: readonly WritingStep[]): { message: string; suggestion: string } {
		const listed = writing.map(step => `'${step.stepId}' (${step.tools.join(', ')})`).join(', ');
		return {
			message: `The workspace is read-only, but these model steps declare tools that can modify it: ${listed}.`,
			suggestion:
				'Remove write, edit and bash from the "tools" of those steps, or run the flow in a workspace it may modify ' +
				'("workspace: in-place", or an exclusive one: a "worktree" or a "pool" slot).',
		};
	}

	/**
	 * The steps as they run in a read-only workspace: model steps without `tools` get {@link DEFAULT_TOOLS} and the
	 * prompt note, and every model and script step gets `GIT_OPTIONAL_LOCKS=0` so a `git status` does not take the index lock of the
	 * shared repository (a step's own value wins). Returns copies; the input is untouched.
	 */
	static apply<T extends FlowStep>(steps: readonly T[]): T[] {
		return steps.map(step => {
			// Only model and script steps run commands; a step asking the user has no environment.
			if (step.type !== 'model' && step.type !== 'script') {
				return step;
			}
			const env = { GIT_OPTIONAL_LOCKS: '0', ...((step as { env?: Record<string, string> }).env ?? {}) };
			if (step.type === 'script') {
				return { ...step, env };
			}
			return {
				...step,
				env,
				tools: step.tools ?? [...ReadOnlyWorkspaceRules.DEFAULT_TOOLS],
				prompt: `${step.prompt}\n\n${ReadOnlyWorkspaceRules.PROMPT_NOTE}`,
			};
		});
	}
}

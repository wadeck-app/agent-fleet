/**
 * Template contract tests: TemplateRenderer (runtime) vs the flow validators (`flow validate`).
 *
 * The renderer is the source of truth. Whatever it resolves must be accepted by the validators,
 * and an escaped `$${{ ... }}` literal must be invisible to every validator, exactly as it is
 * for the renderer. These tests fail when a root is added to the renderer without the validators.
 */
import { createMockFlow, createMockModelStep } from 'flow-engine/test-utils/factories';
import { describe, expect, it } from 'vitest';

import { TEMPLATE_ROOTS, TemplateRenderer } from '../processing/TemplateRenderer';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { FlowValidator } from './FlowValidator';
import { ValidationCode } from './ValidationTypes';

/** One sample expression per supported shape, keyed by renderer root. */
const SAMPLES: Record<string, string[]> = {
	inputs: ['inputs.name', 'inputs.config.deep'],
	steps: ['steps.build.outputs.result', 'steps.build.outputs.obj.deep', 'steps.build.meta.durationMs'],
	task: ['task.priority', 'task.metadata.key'],
	context: ['context.cwd', 'context.nested.value'],
	subSteps: ['subSteps.child.outputs.stderr', 'subSteps.child.status.failed'],
	subStepFeedback: ['subStepFeedback'],
};

/** Roots neither side supports: `flow` was historically whitelisted by the validator only. */
const UNSUPPORTED_ROOTS = ['flow', 'env', 'zzz'];

function buildContext(): TemplateContext {
	return {
		inputs: { name: 'n', config: { deep: 'd' } },
		stepOutputs: new Map([['build', { result: 'r', obj: { deep: 'x' } }]]),
		stepMeta: new Map([['build', { durationMs: 1 }]]),
		taskMetadata: { priority: 'high', metadata: { key: 'k' } },
		context: { cwd: '/tmp', nested: { value: 'v' } },
		subSteps: new Map([['child', { outputs: { stderr: 'boom' }, status: 'failed' }]]),
		subStepFeedback: 'fb',
	} as TemplateContext;
}

/** Roots advertised by the renderer's own "Unknown root" error, so a new root forces a new sample. */
function rendererRoots(): string[] {
	try {
		new TemplateRenderer().render('${{ zzz.unknown }}', buildContext());
	} catch (error) {
		const message = (error as Error).message;
		const list = /Use (.+)$/.exec(message)?.[1];
		if (!list) {
			throw new Error(`Cannot extract the root list from the renderer error: ${message}`);
		}
		return [...list.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]!);
	}
	throw new Error('Renderer did not reject an unknown root; contract probe is broken');
}

/** Flow with a producer `build`, a parent `main` holding the prompt and a child declared with `parent:`. */
function flowWithPrompt(prompt: string, withChild = true) {
	return createMockFlow({
		steps: [
			createMockModelStep({ id: 'build', name: 'Build', prompt: 'build' }),
			createMockModelStep({ id: 'main', name: 'Main', prompt, depends: ['build'] }),
			...(withChild
				? [createMockModelStep({ id: 'child', name: 'Child', prompt: 'child', parent: 'main' })]
				: []),
		],
	});
}

function templateErrors(prompt: string, withChild = true) {
	const result = new FlowValidator().validate(flowWithPrompt(prompt, withChild));
	return result.issues.filter(
		i =>
			i.severity === 'error' &&
			[
				ValidationCode.INVALID_TEMPLATE_SYNTAX,
				ValidationCode.UNDEFINED_STEP,
				ValidationCode.UNDECLARED_OUTPUT_KEY,
			].includes(i.code as ValidationCode)
	);
}

describe('template contract: renderer vs validators', () => {
	it('has a sample for every root the renderer advertises (add one when adding a root)', () => {
		expect(rendererRoots().sort()).toEqual(Object.keys(SAMPLES).sort());
	});

	const allSamples = Object.entries(SAMPLES).flatMap(([root, exprs]) => exprs.map(e => [root, e] as const));

	it.each(allSamples)('renderer resolves %s root sample "%s"', (_root, expression) => {
		expect(() => new TemplateRenderer().render(`\${{ ${expression} }}`, buildContext())).not.toThrow();
	});

	it.each(allSamples)('validator accepts what the renderer resolves: %s root sample "%s"', (_root, expression) => {
		expect(templateErrors(`Use \${{ ${expression} }} here`)).toEqual([]);
	});

	it('exposes the same roots from the shared list as the renderer error advertises', () => {
		expect(rendererRoots().sort()).toEqual([...TEMPLATE_ROOTS].sort());
	});

	it.each(UNSUPPORTED_ROOTS)('root "%s": renderer and validator both reject it (strict agreement)', root => {
		expect(() => new TemplateRenderer().render(`\${{ ${root}.x }}`, buildContext())).toThrow(
			`Unknown root context: '${root}'`
		);
		const errors = templateErrors(`Use \${{ ${root}.x }} here`);
		expect(errors).toHaveLength(1);
		expect(errors[0]!.code).toBe(ValidationCode.INVALID_TEMPLATE_SYNTAX);
		expect(errors[0]!.message).toContain(`Unknown root '${root}'`);
		for (const valid of rendererRoots()) {
			expect(errors[0]!.message).toContain(`'${valid}'`);
		}
	});

	describe('escaped literals ($${{ ... }}) are invisible to every validator, like in the renderer', () => {
		const escapedCases = [
			'$${{ steps.ghost.outputs.y }}',
			'$${{ inputs.a + 1 }}',
			'$${{ nonsense }}',
			'$${{ steps.build.outputs.undeclared }}',
		];

		it.each(escapedCases)('renderer outputs %s as a literal', escaped => {
			const rendered = new TemplateRenderer().render(escaped, buildContext());
			expect(rendered).toBe(escaped.slice(1));
		});

		it.each(escapedCases)('flow validate reports nothing for %s', escaped => {
			const result = new FlowValidator().validate(flowWithPrompt(`Literal: ${escaped} end`));
			const relevant = result.issues.filter(i => i.severity === 'error' || i.severity === 'warning');
			expect(relevant.map(i => `${i.code}: ${i.message}`)).toEqual([]);
		});

		it('does not auto-discover an input referenced only inside an escaped literal', () => {
			const validator = new FlowValidator();
			const result = validator.validate(flowWithPrompt('Literal: $${{ inputs.neverDeclared }}'));
			expect(result.issues.filter(i => i.code === ValidationCode.AUTO_DISCOVERED_INPUT)).toEqual([]);
		});

		it('still validates a real expression next to an escaped one', () => {
			const errors = templateErrors('$${{ steps.ghost.outputs.y }} and ${{ steps.ghost2.outputs.z }}');
			expect(errors.map(e => e.message).join('\n')).toContain('ghost2');
			expect(errors.map(e => e.message).join('\n')).not.toContain('steps.ghost.outputs.y');
		});
	});

	describe('subStepFeedback', () => {
		it('is accepted for a step that has children (declared via parent:)', () => {
			const result = new FlowValidator().validate(flowWithPrompt('Fix:\n${{ subStepFeedback }}'));
			expect(result.issues.filter(i => i.code === ValidationCode.INVALID_TEMPLATE_SYNTAX)).toEqual([]);
			expect(result.issues.filter(i => i.message.includes('subStepFeedback'))).toEqual([]);
		});

		it('on a step without children: renderer returns "" so the validator warns (not errors) naming the cause', () => {
			expect(new TemplateRenderer().render('[${{ subStepFeedback }}]', buildContextWithoutFeedback())).toBe('[]');
			const result = new FlowValidator().validate(flowWithPrompt('Fix:\n${{ subStepFeedback }}', false));
			expect(result.issues.filter(i => i.severity === 'error' && i.message.includes('subStepFeedback'))).toEqual(
				[]
			);
			const warning = result.issues.find(i => i.severity === 'warning' && i.message.includes('subStepFeedback'));
			expect(warning).toBeDefined();
			expect(warning!.message).toContain("'main'");
			expect(warning!.message).toContain('parent');
			expect(warning!.suggestion).toContain('parent: main');
		});
	});
});

function buildContextWithoutFeedback(): TemplateContext {
	const context = buildContext();
	delete context.subStepFeedback;
	return context;
}

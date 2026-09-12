import { describe, expect, it } from 'vitest';

import { TemplateRenderError, TemplateRenderer } from '../processing/TemplateRenderer';
import type { TemplateContext } from '../processing/TemplateRenderer';

describe('TemplateRenderer — subSteps namespace', () => {
	const renderer = new TemplateRenderer();

	const baseContext: TemplateContext = {
		inputs: {},
		stepOutputs: new Map(),
		taskMetadata: {},
	};

	function makeCtx(subSteps: Map<string, { outputs: Record<string, any>; status: string }>): TemplateContext {
		return { ...baseContext, subSteps };
	}

	describe('subSteps.stepId.outputs.varName', () => {
		it('resolves a known output field', () => {
			const ctx = makeCtx(new Map([['validate', { outputs: { stderr: 'parse error' }, status: 'failed' }]]));
			expect(renderer.render('Error: ${{ subSteps.validate.outputs.stderr }}', ctx)).toBe('Error: parse error');
		});

		it('resolves step id containing hyphens and underscores', () => {
			const ctx = makeCtx(
				new Map([['generate-flow_validate', { outputs: { stderr: 'invalid yaml' }, status: 'failed' }]])
			);
			expect(renderer.render('${{ subSteps.generate-flow_validate.outputs.stderr }}', ctx)).toBe('invalid yaml');
		});

		// Missing sub-step / missing output resolve to '' instead of throwing: on the first
		// parent run no sub-step has failed yet, and throwing would crash the parent (7e520e1).
		it('resolves to empty string when sub-step id is not found', () => {
			const ctx = makeCtx(new Map());
			expect(renderer.render('[${{ subSteps.missing-step.outputs.stderr }}]', ctx)).toBe('[]');
		});

		it('resolves to empty string when output var is not found in sub-step', () => {
			const ctx = makeCtx(new Map([['validate', { outputs: { stdout: 'ok' }, status: 'failed' }]]));
			expect(renderer.render('[${{ subSteps.validate.outputs.nonexistent }}]', ctx)).toBe('[]');
		});

		it('resolves to empty string when subSteps context is absent', () => {
			expect(renderer.render('[${{ subSteps.validate.outputs.stderr }}]', baseContext)).toBe('[]');
		});

		it('still throws for a malformed subSteps expression', () => {
			const ctx = makeCtx(new Map());
			expect(() => renderer.render('${{ subSteps.validate.oops.stderr }}', ctx)).toThrow(TemplateRenderError);
		});
	});

	describe('subSteps.stepId.status.failed', () => {
		it('returns "true" (string) when status is failed', () => {
			const ctx = makeCtx(new Map([['validate', { outputs: {}, status: 'failed' }]]));
			expect(renderer.render('${{ subSteps.validate.status.failed }}', ctx)).toBe('true');
		});

		it('returns "false" (string) when status is not failed', () => {
			const ctx = makeCtx(new Map([['validate', { outputs: {}, status: 'completed' }]]));
			expect(renderer.render('${{ subSteps.validate.status.failed }}', ctx)).toBe('false');
		});

		it('throws when status property is not "failed"', () => {
			const ctx = makeCtx(new Map([['validate', { outputs: {}, status: 'failed' }]]));
			expect(() => renderer.render('${{ subSteps.validate.status.unknown }}', ctx)).toThrow(TemplateRenderError);
		});
	});

	describe('subSteps — error message format', () => {
		it('throws with helpful message when namespace is wrong', () => {
			const ctx = makeCtx(new Map([['step', { outputs: {}, status: 'failed' }]]));
			expect(() => renderer.render('${{ subSteps.step }}', ctx)).toThrow('subSteps requires format');
		});
	});
});

describe('TemplateRenderer — {% if/else/endif %} blocks', () => {
	const renderer = new TemplateRenderer();

	const baseContext: TemplateContext = {
		inputs: {},
		stepOutputs: new Map(),
		taskMetadata: {},
	};

	function ctxWithSubSteps(subSteps: Map<string, { outputs: Record<string, any>; status: string }>): TemplateContext {
		return { ...baseContext, subSteps };
	}

	describe('basic if/endif', () => {
		it('includes block when condition is truthy', () => {
			const ctx = ctxWithSubSteps(new Map([['validate', { outputs: {}, status: 'failed' }]]));
			const template = 'Before\n{% if subSteps.validate.status.failed %}\nThe step failed.\n{% endif %}\nAfter';
			expect(renderer.render(template, ctx)).toBe('Before\nThe step failed.\nAfter');
		});

		it('excludes block when condition is falsy', () => {
			const ctx = ctxWithSubSteps(new Map([['validate', { outputs: {}, status: 'completed' }]]));
			const template = 'Before\n{% if subSteps.validate.status.failed %}\nThe step failed.\n{% endif %}\nAfter';
			expect(renderer.render(template, ctx)).toBe('Before\n\nAfter');
		});

		it('interpolates ${{ }} inside a truthy block', () => {
			const ctx = ctxWithSubSteps(
				new Map([['validate', { outputs: { stderr: 'syntax error' }, status: 'failed' }]])
			);
			const template =
				'{% if subSteps.validate.status.failed %}\nError: ${{ subSteps.validate.outputs.stderr }}\n{% endif %}';
			expect(renderer.render(template, ctx)).toBe('Error: syntax error');
		});

		it('does NOT evaluate ${{ }} inside a falsy block (no error for missing vars)', () => {
			const ctx = ctxWithSubSteps(new Map([['validate', { outputs: {}, status: 'completed' }]]));
			const template =
				'{% if subSteps.validate.status.failed %}\n${{ subSteps.validate.outputs.missing }}\n{% endif %}';
			// No error thrown even though 'missing' output does not exist
			expect(() => renderer.render(template, ctx)).not.toThrow();
		});
	});

	describe('if/else/endif', () => {
		it('takes the if-branch when condition is truthy', () => {
			const ctx = ctxWithSubSteps(new Map([['validate', { outputs: {}, status: 'failed' }]]));
			const template =
				'{% if subSteps.validate.status.failed %}\nFailed branch\n{% else %}\nSuccess branch\n{% endif %}';
			expect(renderer.render(template, ctx)).toBe('Failed branch');
		});

		it('takes the else-branch when condition is falsy', () => {
			const ctx = ctxWithSubSteps(new Map([['validate', { outputs: {}, status: 'completed' }]]));
			const template =
				'{% if subSteps.validate.status.failed %}\nFailed branch\n{% else %}\nSuccess branch\n{% endif %}';
			expect(renderer.render(template, ctx)).toBe('Success branch');
		});
	});

	describe('inputs-based conditions', () => {
		it('includes block when inputs flag is truthy string', () => {
			const ctx: TemplateContext = { ...baseContext, inputs: { enabled: 'yes' } };
			// Non-empty string is truthy
			const template = '{% if inputs.enabled %}\nEnabled\n{% endif %}';
			expect(renderer.render(template, ctx)).toBe('Enabled');
		});
	});
});

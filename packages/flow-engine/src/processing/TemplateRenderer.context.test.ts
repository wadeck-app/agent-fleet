import { describe, expect, it } from 'vitest';

import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { TemplateContext } from '../processing/TemplateRenderer';

describe('TemplateRenderer - context.*', () => {
	const renderer = new TemplateRenderer();

	const baseContext: TemplateContext = {
		inputs: {},
		stepOutputs: new Map(),
		taskMetadata: {},
	};

	it('resolves ${{ context.cwd }} from templateContext.context', () => {
		const ctx: TemplateContext = { ...baseContext, context: { cwd: '/home/user/project' } };
		expect(renderer.render('cd "${{ context.cwd }}"', ctx)).toBe('cd "/home/user/project"');
	});

	it('resolves nested context key', () => {
		const ctx: TemplateContext = { ...baseContext, context: { cwd: 'C:\\foo', name: 'test' } };
		expect(renderer.render('${{ context.name }}', ctx)).toBe('test');
	});

	it('throws on unknown context key', () => {
		const ctx: TemplateContext = { ...baseContext, context: { cwd: '/tmp' } };
		expect(() => renderer.render('${{ context.missing }}', ctx)).toThrow();
	});

	it('throws when context is absent and key is accessed', () => {
		const ctx: TemplateContext = { ...baseContext };
		expect(() => renderer.render('${{ context.cwd }}', ctx)).toThrow();
	});

	it('throws on ${{ context }} with no property', () => {
		const ctx: TemplateContext = { ...baseContext, context: { cwd: '/tmp' } };
		expect(() => renderer.render('${{ context }}', ctx)).toThrow();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import {
	ExecutionReferenceError,
	assertExecutionInProject,
	isQualifiedExecutionTarget,
	resolveExecutionReference,
} from './ExecutionReference';

describe('ExecutionReference', () => {
	let fixture: RegisteredProjectFixture;
	let shopId: string;
	let blogId: string;

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture();
		shopId = (await fixture.register('shop', { aliases: ['store'] })).id;
		blogId = (await fixture.register('blog')).id;
	});

	afterEach(() => {
		fixture.dispose();
		vi.restoreAllMocks();
	});

	const resolve = (input: string, flag?: string, extraEnv: NodeJS.ProcessEnv = {}) =>
		resolveExecutionReference(input, flag, fixture.env(extraEnv));

	describe('resolveExecutionReference', () => {
		it('keeps a plain id as it is, with no project (no project is invented)', () => {
			expect(resolve('abc12345')).toEqual({ executionId: 'abc12345' });
		});

		it('keeps a plain id and scopes it to the project selected with -p', () => {
			expect(resolve('abc12345', 'blog')).toEqual({ executionId: 'abc12345', projectId: blogId });
		});

		it('resolves the project of <project>/<id> by name, alias or id prefix', () => {
			expect(resolve('shop/abc12345')).toEqual({ executionId: 'abc12345', projectId: shopId });
			expect(resolve('store/abc12345')).toEqual({ executionId: 'abc12345', projectId: shopId });
			expect(resolve(`${shopId}/abc12345`)).toEqual({ executionId: 'abc12345', projectId: shopId });
		});

		it('accepts -p naming the same project', () => {
			expect(resolve('shop/abc12345', 'store')).toEqual({ executionId: 'abc12345', projectId: shopId });
		});

		it('refuses -p naming another project, naming both', () => {
			expect(() => resolve('shop/abc12345', 'blog')).toThrow(ExecutionReferenceError);
			expect(() => resolve('shop/abc12345', 'blog')).toThrow(/shop.*blog|blog.*shop/s);
		});

		it('lets an explicit project in the id win over an ambient FLOW_PROJECT', () => {
			expect(resolve('shop/abc12345', undefined, { FLOW_PROJECT: 'blog' })).toEqual({
				executionId: 'abc12345',
				projectId: shopId,
			});
		});

		it('reports an unknown project with the SDK suggestions', () => {
			expect(() => resolve('shpo/abc12345')).toThrow(ExecutionReferenceError);
			expect(() => resolve('shpo/abc12345')).toThrow(/shpo.*did you mean.*shop/is);
		});

		it('reports a malformed id with the form to write', () => {
			for (const bad of ['shop/', '/abc12345', 'shop/abc/def']) {
				expect(() => resolve(bad), bad).toThrow(ExecutionReferenceError);
				expect(() => resolve(bad), bad).toThrow(/<project>\/<id>/);
			}
		});
	});

	describe('isQualifiedExecutionTarget', () => {
		it('recognises <project>/<id-like> and not a path', () => {
			expect(isQualifiedExecutionTarget('shop/abc12345')).toBe(true);
			expect(isQualifiedExecutionTarget('shop/')).toBe(true);
			expect(isQualifiedExecutionTarget('abc12345')).toBe(false);
			expect(isQualifiedExecutionTarget('./flows/a.yml')).toBe(false);
			expect(isQualifiedExecutionTarget('flows/a.yml')).toBe(false);
			expect(isQualifiedExecutionTarget('a\\b')).toBe(false);
		});
	});

	describe('assertExecutionInProject', () => {
		const lookup = fixtureLookup();
		function fixtureLookup() {
			return (id: string) => ({ kind: 'known' as const, name: id === 'p1' ? 'shop' : 'blog' });
		}

		it('passes when the execution belongs to the project, or no project is required', () => {
			expect(() => assertExecutionInProject({ executionId: 'a', projectId: 'p1' }, 'p1', lookup)).not.toThrow();
			expect(() => assertExecutionInProject({ executionId: 'a', projectId: 'p1' }, undefined, lookup)).not.toThrow();
		});

		it('names both projects when it belongs to another one', () => {
			expect(() => assertExecutionInProject({ executionId: 'abc12345', projectId: 'p2' }, 'p1', lookup)).toThrow(
				/abc12345.*blog \(p2\).*shop \(p1\)/s
			);
		});

		it('says no project is recorded for an old record', () => {
			expect(() => assertExecutionInProject({ executionId: 'abc12345' }, 'p1', lookup)).toThrow(/no project recorded/);
		});
	});
});

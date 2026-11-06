import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import { resolveRunOrigin } from './RunOrigin';

const NOW = new Date('2026-10-31T12:00:00.000Z');

describe('resolveRunOrigin', () => {
	let fixture: RegisteredProjectFixture;
	let shop: Awaited<ReturnType<RegisteredProjectFixture['register']>>;
	let blog: Awaited<ReturnType<RegisteredProjectFixture['register']>>;

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture();
		shop = await fixture.register('shop');
		blog = await fixture.register('blog');
	});

	afterEach(() => {
		fixture.dispose();
	});

	const origin = (cwd: string, projectRef?: string, extraEnv: NodeJS.ProcessEnv = {}) =>
		resolveRunOrigin({ cwd, projectRef, env: fixture.env(extraEnv), now: NOW });

	it('records the origin when -p names another project than the cwd one', () => {
		expect(origin(blog.folder!, 'shop')).toEqual({
			tool: 'flow',
			at: NOW.toISOString(),
			projectId: shop.id,
			projectName: 'shop',
			cwd: expect.any(String),
		});
	});

	it('records it when the cwd is outside every project', () => {
		expect(origin(fixture.makeFolder('elsewhere'), 'shop')).toMatchObject({ projectId: shop.id });
	});

	it('records it for FLOW_PROJECT naming another project', () => {
		expect(origin(blog.folder!, undefined, { FLOW_PROJECT: 'shop' })).toMatchObject({ projectId: shop.id });
	});

	it('records nothing when -p names the project the cwd is in', () => {
		expect(origin(shop.folder!, 'shop')).toBeUndefined();
	});

	it('records nothing without an explicit project', () => {
		expect(origin(shop.folder!)).toBeUndefined();
	});

	it('records nothing when the project does not resolve: the daemon refuses the run with the full message', () => {
		expect(origin(blog.folder!, 'nope')).toBeUndefined();
	});
});

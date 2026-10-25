import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { WorkerProjectError, resolveWorkerProjects } from './WorkerProjects';

describe('resolveWorkerProjects', () => {
	let fixture: RegisteredProjectFixture;

	beforeEach(() => {
		fixture = new RegisteredProjectFixture();
	});

	afterEach(() => {
		fixture.dispose();
	});

	it('serves the project of the cwd when nothing else is asked', async () => {
		const alpha = await fixture.register('alpha');

		const projects = resolveWorkerProjects({ refs: [], cwd: alpha.folder!, env: fixture.env() });

		expect(projects.map(project => project.id)).toEqual([alpha.id]);
		expect(projects[0]).toMatchObject({ name: 'alpha', path: alpha.folder });
	});

	it('serves its own project (FLOW_PROJECT, else the cwd) plus the ones named, own first, without duplicates', async () => {
		const alpha = await fixture.register('alpha');
		const beta = await fixture.register('beta', { aliases: ['b'] });
		const gamma = await fixture.register('gamma');

		const projects = resolveWorkerProjects({
			refs: ['b', beta.id, gamma.id],
			cwd: alpha.folder!,
			env: fixture.env(),
		});

		expect(projects.map(project => project.id)).toEqual([alpha.id, beta.id, gamma.id]);
	});

	it('takes FLOW_PROJECT as the own project instead of the cwd', async () => {
		const alpha = await fixture.register('alpha');
		const beta = await fixture.register('beta');

		const projects = resolveWorkerProjects({
			refs: [],
			cwd: alpha.folder!,
			env: fixture.env({ FLOW_PROJECT: 'beta' }),
		});

		expect(projects.map(project => project.id)).toEqual([beta.id]);
	});

	it('serves only the named projects when the cwd is in none: naming them is enough', async () => {
		const beta = await fixture.register('beta');
		const outside = fixture.makeFolder('outside');

		const projects = resolveWorkerProjects({ refs: ['beta'], cwd: outside, env: fixture.env() });

		expect(projects.map(project => project.id)).toEqual([beta.id]);
	});

	it('refuses to start with no project at all, with the register hint', () => {
		const outside = fixture.makeFolder('outside');

		expect(() => resolveWorkerProjects({ refs: [], cwd: outside, env: fixture.env() })).toThrow(
			`project add "${outside}"`
		);
	});

	it('refuses a folder path given as a project and says what to pass instead', async () => {
		const alpha = await fixture.register('alpha');

		for (const ref of [alpha.folder!, 'C:/work/app', '.\\app', '../app']) {
			let failure: unknown;
			try {
				resolveWorkerProjects({ refs: [ref], cwd: alpha.folder!, env: fixture.env() });
			} catch (error) {
				failure = error;
			}
			expect(failure, `ref ${ref}`).toBeInstanceOf(WorkerProjectError);
			const message = (failure as Error).message;
			expect(message).toContain(`--project "${ref}"`);
			expect(message).toContain('is a folder path');
			expect(message).toContain('project list');
			expect(message).toContain('project add');
		}
	});

	it('names the flag when a reference is unknown', async () => {
		const alpha = await fixture.register('alpha');

		expect(() => resolveWorkerProjects({ refs: ['nope'], cwd: alpha.folder!, env: fixture.env() })).toThrow(
			'--project "nope"'
		);
	});

	it('fails when FLOW_PROJECT names an unknown project, even though the cwd is registered', async () => {
		const alpha = await fixture.register('alpha');

		expect(() =>
			resolveWorkerProjects({ refs: [], cwd: alpha.folder!, env: fixture.env({ FLOW_PROJECT: 'nope' }) })
		).toThrow('FLOW_PROJECT="nope"');
	});
});

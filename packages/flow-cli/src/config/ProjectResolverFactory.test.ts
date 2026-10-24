import { describe, expect, it } from 'vitest';

import { DefaultProjectResolver } from './DefaultProjectResolver.js';
import { ProjectResolverFactory } from './ProjectResolverFactory.js';

describe('ProjectResolverFactory', () => {
	// No config key selects another implementation yet; this pins the single wiring point.
	it('provides the built-in resolver', () => {
		expect(ProjectResolverFactory.create()).toBeInstanceOf(DefaultProjectResolver);
	});
});

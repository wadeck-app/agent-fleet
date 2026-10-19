import { describe, expect, it } from 'vitest';

import { FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID } from './AppModuleIds.js';

describe('AppModuleIds', () => {
	it('keeps the ids app-core knows the modules by (changing one breaks installed registrations)', () => {
		expect([FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID]).toEqual(['flow', 'flow-chart']);
	});
});

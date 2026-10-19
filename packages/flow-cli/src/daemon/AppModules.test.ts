import { FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { APP_MODULES } from './AppModules.js';

describe('APP_MODULES', () => {
	it('lists flow before flow-chart: flow-chart requires flow, so flow must be registered first', () => {
		expect(APP_MODULES.map(m => m.id)).toEqual([FLOW_APP_MODULE_ID, FLOW_CHART_APP_MODULE_ID]);
	});

	it('keeps the historical app-module/ folder for flow and gives flow-chart its own bundle folder', () => {
		expect(APP_MODULES.map(m => [m.bundleDir, m.sourcePackage])).toEqual([
			['app-module', 'app-module-flow'],
			['app-module-flow-chart', 'app-module-flow-chart'],
		]);
	});
});

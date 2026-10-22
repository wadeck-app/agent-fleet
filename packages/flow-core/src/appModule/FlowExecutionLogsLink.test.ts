import { describe, expect, it } from 'vitest';

import { executionStepLogsPath } from './FlowExecutionLogsLink.js';

describe('executionStepLogsPath', () => {
	it('points at the logs page of the run', () => {
		expect(executionStepLogsPath('abc123')).toBe('/modules/flow/executions/abc123/logs');
	});

	it('preselects the step, encoding both ids', () => {
		expect(executionStepLogsPath('ab 1', 'build/step 2')).toBe(
			'/modules/flow/executions/ab%201/logs?step=build%2Fstep%202'
		);
	});
});

/**
 * Shared Test Suite Configuration
 *
 * Centralized configuration for all test runners.
 * This file is the single source of truth for test suite definitions.
 */

// Test suite type constants
const testSuiteType_UNIT = 'unit';
const testSuiteType_E2E_FUNC = 'e2e-functional';
const testSuiteType_VISUAL = 'visual';

// Test suite configurations
const testSuites = [
	{
		name: 'Backend Unit Tests',
		command: 'npm',
		// args: ['run', 'test', '--workspace=@app/backend'],
		args: ['run', 'test', '--workspace=web-backend'],
		type: testSuiteType_UNIT,
	},
	{
		name: 'Frontend Unit Tests',
		command: 'npm',
		// args: ['run', 'test', '--workspace=@app/frontend'],
		args: ['run', 'test', '--workspace=web-frontend'],
		type: testSuiteType_UNIT,
	},
	{
		name: 'Worker Unit Tests',
		command: 'npm',
		args: ['run', 'test', '--workspace=worker'],
		type: testSuiteType_UNIT,
	},
	{
		name: 'Orchestrator Unit Tests',
		command: 'npm',
		args: ['run', 'test', '--workspace=orchestrator'],
		type: testSuiteType_UNIT,
	},
	{
		name: 'Orchestrator Adapters Unit Tests',
		command: 'npm',
		args: ['run', 'test', '--workspace=orchestrator-adapters'],
		type: testSuiteType_UNIT,
	},
	{
		name: 'Shared Front/Back Unit Tests',
		command: 'npm',
		// args: ['run', 'test', '--workspace=@app/shared-frontend-backend'],
		args: ['run', 'test', '--workspace=shared-frontend-backend'],
		type: testSuiteType_UNIT,
	},
	{
		name: 'E2E Application Tests',
		command: 'npm',
		// args: ['run', 'test:app', '--workspace=@app/e2e-web'],
		args: ['run', 'test:app', '--workspace=e2e-web'],
		type: testSuiteType_E2E_FUNC,
		env: { PLAYWRIGHT_HTML_OPEN: 'never' },
	},
	{
		name: 'E2E Component Functional Tests',
		command: 'npm',
		// args: ['run', 'test:components', '--workspace=@app/e2e-web'],
		args: ['run', 'test:components', '--workspace=e2e-web'],
		type: testSuiteType_E2E_FUNC,
		env: { PLAYWRIGHT_HTML_OPEN: 'never' },
	},
	// Disabled for the moment, too many changes ongoing
	// {
	// 	name: 'Visual Regression Tests',
	// 	command: 'npm',
	// 	args: ['run', 'test:visual'],
	// 	type: testSuiteType_VISUAL,
	// 	env: { PLAYWRIGHT_HTML_OPEN: 'never' }
	// }
];

export { testSuites, testSuiteType_UNIT, testSuiteType_E2E_FUNC, testSuiteType_VISUAL };

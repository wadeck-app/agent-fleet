#!/usr/bin/env node

/**
 * Test runner for Lego approach tests (A1, A2, A3)
 */
import { spawn } from 'child_process';
import path from 'path';

const FRONTEND_PATH = path.join(process.cwd(), 'packages', 'web-frontend');

const TEST_FILES = [
	'src/app/pages/_lego/_1_widget-isolated/_framework/WidgetDataTable.test.tsx',
	'src/app/pages/_lego/_2_context-provider/_framework/ProductDomainContext.test.tsx',
	'src/app/pages/_lego/_3_feature-hooks/_framework/HookDataTable.test.tsx',
];

console.log('Running Lego approach tests (A1, A2, A3)...\n');

const vitest = spawn('npx', ['vitest', 'run', ...TEST_FILES, '--reporter=verbose'], {
	cwd: FRONTEND_PATH,
	shell: true,
	stdio: 'inherit',
});

vitest.on('close', code => {
	if (code === 0) {
		console.log('\n✅ All tests passed!');
	} else {
		console.log('\n❌ Some tests failed.');
	}
	process.exit(code);
});

vitest.on('error', err => {
	console.error('Failed to run tests:', err);
	process.exit(1);
});

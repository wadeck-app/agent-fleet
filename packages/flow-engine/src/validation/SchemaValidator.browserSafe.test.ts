/**
 * The web frontend runs the validator in the browser, where `node:path` is an empty module: `path.posix` and
 * `path.win32` are undefined. The absolute-workingDir check must not depend on node:path at all.
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { describe, expect, it, vi } from 'vitest';

import type { FlowDefinition } from '../types';
import { SchemaValidator } from './SchemaValidator';
import { ValidationCode } from './ValidationTypes';

// Mimics vite's `__vite-browser-external`: nothing is exported, any access to a path flavour is a bug.
vi.mock('node:path', () => ({
	get posix(): never {
		throw new TypeError("Cannot read properties of undefined (reading 'isAbsolute')");
	},
	get win32(): never {
		throw new TypeError("Cannot read properties of undefined (reading 'isAbsolute')");
	},
	default: {},
}));

function validate(workingDir: string) {
	const collector = new MockIssueCollector();
	new SchemaValidator(collector).validateSchema({
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		inputs: {},
		workspace: 'pool',
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo', workingDir }],
	} as unknown as FlowDefinition);
	return collector.issues.filter(i => i.code === ValidationCode.WORKSPACE_WORKINGDIR_ABSOLUTE);
}

describe('SchemaValidator - workingDir check without node:path', () => {
	it.each(['/srv/x', 'C:\\x', 'C:/x', 'c:\\x', '\\\\server\\share\\x', '//server/share/x', '\\x'])(
		'warns for the absolute workingDir %j',
		workingDir => {
			expect(validate(workingDir)).toHaveLength(1);
		}
	);

	it.each(['./x', 'src', '..\\x', '../x', 'C:x', 'packages/app'])(
		'does not warn for the relative workingDir %j',
		workingDir => {
			expect(validate(workingDir)).toHaveLength(0);
		}
	);
});

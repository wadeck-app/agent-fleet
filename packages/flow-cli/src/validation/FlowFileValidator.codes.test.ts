import { ValidationCode } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import { validationCodeToType } from './FlowFileValidator';

describe('validationCodeToType', () => {
	// A code added to the engine and forgotten here made `flow validate` crash with "Unknown ValidationCode" (seen with
	// WORKSPACE_READONLY_CONFLICT): every code must map to a category.
	it.each(Object.values(ValidationCode))('maps %s to a category', code => {
		expect(validationCodeToType(code)).toMatch(/^(schema|input|graph|cycle|template|secret|workspace)$/);
	});

	it('still refuses a value that is not a ValidationCode', () => {
		expect(() => validationCodeToType('NOT_A_CODE' as ValidationCode)).toThrow(/Unknown ValidationCode/);
	});
});

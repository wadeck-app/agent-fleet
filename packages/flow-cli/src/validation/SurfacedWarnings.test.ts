import type { ValidationIssue } from 'flow-engine';
import { ValidationCode } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import { surfacedWarningsOf } from './SurfacedWarnings';

const warning = (code: ValidationCode): ValidationIssue => ({ severity: 'warning', code, message: `m ${code}` });

describe('surfacedWarningsOf - host tool warnings are never silent', () => {
	it.each([
		ValidationCode.HOST_TOOL_UNDER_CONFINED_PROFILE,
		ValidationCode.HOST_TOOL_UNUSED_ARG,
		ValidationCode.HOST_TOOL_LOG_SENSITIVE,
		ValidationCode.HOST_TOOL_CWD_WORKSPACE_CONFIG_DRIVEN,
	])('prints the warning %s', code => {
		expect(surfacedWarningsOf([warning(code)])).toEqual([`m ${code}`]);
	});

	it('still drops an engine warning that is not surfaced', () => {
		expect(surfacedWarningsOf([warning(ValidationCode.UNUSED_INPUT)])).toEqual([]);
	});
});

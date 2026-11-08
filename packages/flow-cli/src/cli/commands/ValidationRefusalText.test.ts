import { formatValidationRefusal } from './ValidationRefusalText';

describe('formatValidationRefusal', () => {
	const issues = [
		{
			severity: 'error',
			code: 'MISSING_FIELD',
			message: 'The flow does not declare a workspace.',
			location: { field: 'workspace' },
			suggestion: 'Add "workspace: in-place".',
		},
		{ severity: 'error', code: 'INVALID_VALUE', message: 'Bad step', location: { stepId: 's1' } },
	];

	it('prints each issue as a line with where it is and the fix, not as JSON', () => {
		const text = formatValidationRefusal(JSON.stringify(issues));

		expect(text).toContain('[fail] Flow has 2 errors');
		expect(text).toContain('  - The flow does not declare a workspace. [workspace]');
		expect(text).toContain('    Fix: Add "workspace: in-place".');
		expect(text).toContain('  - Bad step [s1]');
		expect(text).not.toContain('"severity"');
	});

	it('says "error" for a single issue', () => {
		expect(formatValidationRefusal(JSON.stringify([issues[1]]))).toContain('Flow has 1 error ');
	});

	it.each(['plain text', '[]', '{"a":1}'])('returns other messages as an error line: %s', message => {
		expect(formatValidationRefusal(message)).toBe(`Error: ${message}`);
	});
});

import { describe, expect, it } from 'vitest';

import { formatCliError } from './CliErrorOutput';

describe('formatCliError', () => {
	it('prefixes the message with "Error: " (one space)', () => {
		expect(formatCliError('boom')).toBe('Error: boom');
	});

	it('keeps a multi-line message (hint lines, FLOW_DEBUG stack) intact', () => {
		expect(formatCliError('boom\nSet FLOW_DEBUG=1 to print the stack trace.')).toBe(
			'Error: boom\nSet FLOW_DEBUG=1 to print the stack trace.'
		);
	});
});

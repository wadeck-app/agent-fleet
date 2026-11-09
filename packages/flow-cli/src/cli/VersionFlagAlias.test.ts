import { describe, expect, it } from 'vitest';

import { withVersionFlagAlias } from './VersionFlagAlias';

const NODE = ['node', 'flow'];

describe('withVersionFlagAlias', () => {
	it('turns a leading -v into --version', () => {
		expect(withVersionFlagAlias([...NODE, '-v'])).toEqual([...NODE, '--version']);
	});

	it('leaves -V and --version alone', () => {
		expect(withVersionFlagAlias([...NODE, '-V'])).toEqual([...NODE, '-V']);
		expect(withVersionFlagAlias([...NODE, '--version'])).toEqual([...NODE, '--version']);
	});

	// A -v after a command belongs to that command (for example a future verbose flag), not to the program.
	it('does not touch a -v that follows a command or other arguments', () => {
		expect(withVersionFlagAlias([...NODE, 'run', '-v'])).toEqual([...NODE, 'run', '-v']);
		expect(withVersionFlagAlias([...NODE, '--pid', '-v'])).toEqual([...NODE, '--pid', '-v']);
	});

	it('does not mutate its input and handles a bare invocation', () => {
		const input = [...NODE, '-v'];
		withVersionFlagAlias(input);
		expect(input).toEqual([...NODE, '-v']);
		expect(withVersionFlagAlias(NODE)).toEqual(NODE);
	});
});

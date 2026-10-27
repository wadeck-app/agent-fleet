import { describe, expect, it } from 'vitest';

import { validateNoLiteralCredentials } from './LiteralCredentials.js';

describe('validateNoLiteralCredentials', () => {
	it('accepts options without a sensitive field', () => {
		expect(() => validateNoLiteralCredentials({ image: 'node:22' }, 'ctx')).not.toThrow();
	});

	it('accepts a sensitive field that is a whole ${ENV_VAR} reference', () => {
		expect(() => validateNoLiteralCredentials({ token: '${SANDBOX_TOKEN}' }, 'ctx')).not.toThrow();
	});

	it('rejects a literal credential, naming the context and the field', () => {
		expect(() => validateNoLiteralCredentials({ token: 'abc123' }, 'worker source "docker" options')).toThrow(
			/Literal credential value in worker source "docker" options: sensitive field "token"/
		);
	});

	it('rejects a reference mixed with literal text', () => {
		expect(() => validateNoLiteralCredentials({ password: 'pre-${X}' }, 'ctx')).toThrow(/Literal credential/);
	});

	it('does not look at non-string values', () => {
		expect(() => validateNoLiteralCredentials({ token: 5 }, 'ctx')).not.toThrow();
	});
});

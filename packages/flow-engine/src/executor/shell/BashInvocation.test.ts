import { describe, expect, it } from 'vitest';

import { BashInvocation } from './BashInvocation';

describe('BashInvocation.buildArgs', () => {
	it('strict (default): errexit + nounset flags precede the script path, script content untouched', () => {
		expect(BashInvocation.buildArgs('/tmp/s.sh', true)).toEqual(['-e', '-u', '/tmp/s.sh']);
	});

	it('non-strict: only the script path (historical behaviour)', () => {
		expect(BashInvocation.buildArgs('/tmp/s.sh', false)).toEqual(['/tmp/s.sh']);
	});
});

describe('BashInvocation.STRICT_FAILURE_HINT', () => {
	it('names the mode and the opt-out', () => {
		expect(BashInvocation.STRICT_FAILURE_HINT).toContain('strict mode (set -eu)');
		expect(BashInvocation.STRICT_FAILURE_HINT).toContain('strict: false');
	});
});

import { describe, expect, it } from 'vitest';

import { requireAwsRegion } from './AwsRegion';
import { failure } from './testing/ExpectedFailures';

describe('requireAwsRegion', () => {
	it('accepts the usual region forms and returns them unchanged', () => {
		for (const region of ['us-east-1', 'eu-west-3', 'ap-southeast-2', 'us-gov-east-1']) {
			expect(requireAwsRegion(region)).toBe(region);
		}
	});

	it('refuses anything that is not a region (it becomes part of the opened host names)', () => {
		for (const region of [
			'',
			'us-east',
			'US-EAST-1',
			'us-east-1.evil.com',
			'us-east-1/x',
			'us_east_1',
			' us-east-1',
		]) {
			const error = failure(() => requireAwsRegion(region), JSON.stringify(region));

			expect(error.kind, region).toBe('invalid-argument');
			expect(error.message, region).toContain(`AWS region "${region}" is not valid`);
		}
	});
});

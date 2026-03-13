import { describe, expect, it } from 'vitest';

import { feedbackApi } from './feedbackApi';

/**
 * ===========================================================================================
 * FEEDBACK API TESTS
 * ===========================================================================================
 *
 * Structure-only tests for the feedback API client.
 *
 * ===========================================================================================
 */

describe('feedbackApi', () => {
	describe('structure', () => {
		it('should export submitFeedback as a function', () => {
			expect(feedbackApi).toHaveProperty('submitFeedback');
			expect(typeof feedbackApi.submitFeedback).toBe('function');
		});

		it('should export getRetrospective as a function', () => {
			expect(feedbackApi).toHaveProperty('getRetrospective');
			expect(typeof feedbackApi.getRetrospective).toBe('function');
		});
	});
});

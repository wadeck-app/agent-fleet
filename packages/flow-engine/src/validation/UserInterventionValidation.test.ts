/**
 * Test for UserIntervention step validation
 *
 * This test validates the test-user-intervention flow from flows.yml
 * to ensure the UserInterventionStep validation is working correctly.
 */
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { FlowValidator } from './FlowValidator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('UserIntervention Flow Validation', () => {
	it('should successfully validate test-user-intervention flow from flows.yml', () => {
		// Load flows.yml
		const flowsPath = path.join(__dirname, '../../../../../.agent-fleet/flows.yml');
		const flowsContent = fs.readFileSync(flowsPath, 'utf8');
		const flows = yaml.load(flowsContent) as Record<string, any>;

		// Extract test-user-intervention flow
		const testFlow = flows['test-user-intervention'];
		expect(testFlow).toBeDefined();

		// Create flow definition
		const flowDefinition: FlowDefinition = {
			id: 'test-user-intervention',
			...testFlow,
		};

		// Validate flow
		const validator = new FlowValidator();
		const result = validator.validate(flowDefinition);

		// Log details if validation fails
		if (!result.valid) {
			console.error('\n❌ Validation Issues:');
			const errors = result.issues.filter(i => i.severity === 'error');
			errors.forEach((error, i) => {
				console.error(`  ${i + 1}. [${error.code}] ${error.message}`);
				if (error.location) {
					console.error(`     Location: ${JSON.stringify(error.location)}`);
				}
				if (error.suggestion) {
					console.error(`     Suggestion: ${error.suggestion}`);
				}
			});
		}

		const warnings = result.issues.filter(i => i.severity === 'warning');
		if (warnings.length > 0) {
			console.warn('\n⚠️  Validation Warnings:');
			warnings.forEach((warning, i) => {
				console.warn(`  ${i + 1}. [${warning.code}] ${warning.message}`);
				if (warning.location) {
					console.warn(`     Location: ${JSON.stringify(warning.location)}`);
				}
			});
		}

		// Assert validation passed
		expect(result.valid).toBe(true);
		expect(result.summary.errors).toBe(0);

		// The flow should have 3 steps
		expect(flowDefinition.steps).toHaveLength(3);

		// Step 2 should be a user_intervention step
		const interventionStep = flowDefinition.steps[1];
		expect(interventionStep.type).toBe('user_intervention');
		expect(interventionStep.id).toBe('approval');

		if (interventionStep.type === 'user_intervention') {
			expect(interventionStep.interventionType).toBe('approval');
			expect(interventionStep.blocking).toBe(true);
			expect(interventionStep.approval).toBeDefined();
			expect(interventionStep.approval?.title).toContain('Approve Deployment');
		}
	});

	it('should validate a simple approval intervention step', () => {
		const flow: FlowDefinition = {
			id: 'test-simple-approval',
			name: 'Test Simple Approval',
			description: 'Test flow with simple approval step',
			version: '1.0.0',
			workspace: {
				mode: 'manual',
				gitStrategy: 'any',
				reusePolicy: 'always',
			},
			inputs: {},
			steps: [
				{
					type: 'user_intervention',
					id: 'approve',
					name: 'Approve Action',
					interventionType: 'approval',
					blocking: true,
					approval: {
						title: 'Please approve this action',
						description: 'Click approve to proceed',
						allowReject: true,
					},
				},
			],
		};

		const validator = new FlowValidator();
		const result = validator.validate(flow);

		expect(result.valid).toBe(true);
		expect(result.summary.errors).toBe(0);
	});

	it('should fail validation for approval step without title', () => {
		const flow: FlowDefinition = {
			id: 'test-invalid-approval',
			name: 'Test Invalid Approval',
			description: 'Test flow with invalid approval step',
			version: '1.0.0',
			workspace: {
				mode: 'manual',
				gitStrategy: 'any',
				reusePolicy: 'always',
			},
			inputs: {},
			steps: [
				{
					type: 'user_intervention',
					id: 'approve',
					name: 'Approve Action',
					interventionType: 'approval',
					blocking: true,
					approval: {
						title: '', // Empty title should fail
					} as any,
				},
			],
		};

		const validator = new FlowValidator();
		const result = validator.validate(flow);

		expect(result.valid).toBe(false);
		expect(result.summary.errors).toBeGreaterThan(0);
		const errors = result.issues.filter(i => i.severity === 'error');
		expect(errors.some(e => e.message.includes('must have a non-empty title'))).toBe(true);
	});

	it('should fail validation for approval step without approval config', () => {
		const flow: FlowDefinition = {
			id: 'test-missing-approval-config',
			name: 'Test Missing Approval Config',
			description: 'Test flow with missing approval config',
			version: '1.0.0',
			workspace: {
				mode: 'manual',
				gitStrategy: 'any',
				reusePolicy: 'always',
			},
			inputs: {},
			steps: [
				{
					type: 'user_intervention',
					id: 'approve',
					name: 'Approve Action',
					interventionType: 'approval',
					blocking: true,
					// Missing approval config
				} as any,
			],
		};

		const validator = new FlowValidator();
		const result = validator.validate(flow);

		expect(result.valid).toBe(false);
		expect(result.summary.errors).toBeGreaterThan(0);
		const errors = result.issues.filter(i => i.severity === 'error');
		expect(errors.some(e => e.message.includes("must have an 'approval' config"))).toBe(true);
	});

	it('should validate question intervention step', () => {
		const flow: FlowDefinition = {
			id: 'test-question',
			name: 'Test Question',
			description: 'Test flow with question step',
			version: '1.0.0',
			workspace: {
				mode: 'manual',
				gitStrategy: 'any',
				reusePolicy: 'always',
			},
			inputs: {},
			steps: [
				{
					type: 'user_intervention',
					id: 'ask',
					name: 'Ask User',
					interventionType: 'question',
					blocking: true,
					question: {
						question: 'How many retries?',
						responseType: 'number',
					},
				},
			],
		};

		const validator = new FlowValidator();
		const result = validator.validate(flow);

		expect(result.valid).toBe(true);
		expect(result.summary.errors).toBe(0);
	});

	it('should validate choice intervention step', () => {
		const flow: FlowDefinition = {
			id: 'test-choice',
			name: 'Test Choice',
			description: 'Test flow with choice step',
			version: '1.0.0',
			workspace: {
				mode: 'manual',
				gitStrategy: 'any',
				reusePolicy: 'always',
			},
			inputs: {},
			steps: [
				{
					type: 'user_intervention',
					id: 'choose',
					name: 'Choose Option',
					interventionType: 'choice',
					blocking: true,
					choice: {
						question: 'Which environment?',
						options: [
							{ id: 'dev', label: 'Development' },
							{ id: 'prod', label: 'Production' },
						],
						allowMultiple: false,
					},
				},
			],
		};

		const validator = new FlowValidator();
		const result = validator.validate(flow);

		expect(result.valid).toBe(true);
		expect(result.summary.errors).toBe(0);
	});
});

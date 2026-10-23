import * as yaml from 'js-yaml';
import { beforeAll, describe, expect, it } from 'vitest';

import { SECRET_EXAMPLE_FLOW_YAML } from '../secrets/SecretFlowExample';
import { SecretUsageAnalyzer } from '../secrets/SecretUsageAnalyzer';
import type { FlowDefinition } from '../types';
import { FlowValidator } from '../validation/FlowValidator';
import { FlowCapabilitiesGenerator } from './FlowCapabilitiesGenerator';

describe('FlowCapabilitiesGenerator', () => {
	const generator = new FlowCapabilitiesGenerator();
	let result: string;

	beforeAll(() => {
		result = generator.generate();
	});

	it('returns a non-empty string', () => {
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});

	it('contains all required section headings', () => {
		expect(result).toContain('Step Types');
		expect(result).toContain('Variable Types');
		expect(result).toContain('Template Syntax');
		expect(result).toContain('Workspace');
		expect(result).toContain('Status Transitions');
		expect(result).toContain('Intervention Types');
		expect(result).toContain('Feedback');
	});

	it('contains all step type names', () => {
		expect(result).toContain('model');
		expect(result).toContain('script');
		expect(result).toContain('subflow');
		expect(result).toContain('user_intervention');
	});

	it('documents script strict mode, its default, the behaviour change and the pipefail opt-in', () => {
		expect(result).toContain('`strict`');
		expect(result).toContain('BEHAVIOUR CHANGE');
		expect(result).toContain('strict: false');
		expect(result).toContain('set -o pipefail');
	});

	it('contains all major variable types', () => {
		expect(result).toContain('string');
		expect(result).toContain('boolean');
		expect(result).toContain('markdown');
		expect(result).toContain('priority');
		expect(result).toContain('integer');
		expect(result).toContain('percentage');
		expect(result).toContain('duration');
		expect(result).toContain('enum');
		expect(result).toContain('multi-enum');
		expect(result).toContain('file');
		expect(result).toContain('folder');
		expect(result).toContain('date');
		expect(result).toContain('datetime');
		expect(result).toContain('regex');
		expect(result).toContain('array');
		expect(result).toContain('keyvalue');
		expect(result).toContain('password');
		expect(result).toContain('url');
		expect(result).toContain('text');
		expect(result).toContain('object');
		expect(result).toContain('number');
	});

	it('documents template syntax patterns', () => {
		expect(result).toContain('steps.');
		expect(result).toContain('inputs.');
		expect(result).toContain('task.');
	});

	it('documents workspace modes', () => {
		expect(result).toContain('isolated');
		expect(result).toContain('shared');
		expect(result).toContain('manual');
	});

	it('documents workspace git strategies', () => {
		expect(result).toContain('main-only');
		expect(result).toContain('feature-branch');
		expect(result).toContain('worktree');
	});

	it('documents status transition fields', () => {
		expect(result).toContain('onSuccess');
		expect(result).toContain('onFailure');
		// StatusTransitionConfig fields are named 'task' and 'ticket' (not ticketStatus/taskStatus)
		expect(result).toContain('task:');
		expect(result).toContain('ticket:');
	});

	it('documents intervention types', () => {
		expect(result).toContain('approval');
		expect(result).toContain('question');
		expect(result).toContain('choice');
	});

	it('documents feedback and retrospective API endpoints', () => {
		expect(result).toContain('/api/tickets/:ticketId/feedback');
		expect(result).toContain('/api/flows/:flowId/feedback');
		expect(result).toContain('/api/tickets/:ticketId/retrospective');
	});

	it('is deterministic — generate() returns the same string on repeated calls', () => {
		const second = generator.generate();
		expect(second).toBe(result);
	});
});

describe('FlowCapabilitiesGenerator - secrets', () => {
	const result = new FlowCapabilitiesGenerator().generate();

	it('no longer describes password as UI-only masking', () => {
		expect(result).not.toContain('Sensitive value, masked in UI');
		expect(result).toContain('| `password` |');
		expect(result).toContain('secret');
	});

	it('has a Secrets section covering declaration, run time, usage, limits and masking', () => {
		expect(result).toContain('## Section 8: Secrets');
		expect(result).toContain('type: password');
		expect(result).toContain('-i API_TOKEN=env://');
		expect(result).toContain('file://./');
		expect(result).toContain('daemon environment');
		expect(result).toContain('secrets: [API_TOKEN]');
		expect(result).toContain('model');
		expect(result).toContain('user_intervention');
		expect(result).toContain('subflow');
		expect(result).toContain('at least 8 characters');
		expect(result).toContain('[secret:NAME]');
		for (const encoding of ['raw', 'JSON-escaped', 'URL-encoded', 'base64', 'hex']) {
			expect(result).toContain(encoding);
		}
		expect(result).toContain('NOT covered');
	});

	it('embeds the shared example flow', () => {
		expect(result).toContain(SECRET_EXAMPLE_FLOW_YAML.trim());
	});
});

describe('SECRET_EXAMPLE_FLOW_YAML', () => {
	it('is a valid flow without validation errors', () => {
		const flow = yaml.load(SECRET_EXAMPLE_FLOW_YAML) as FlowDefinition;
		const result = new FlowValidator().validate(flow);
		expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
		expect(new SecretUsageAnalyzer().describe(flow)).toEqual([
			{
				name: 'API_TOKEN',
				required: true,
				sourceKind: 'run-time',
				usedBy: ['call-api'],
				description: expect.any(String),
			},
		]);
	});
});

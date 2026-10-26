import * as yaml from 'js-yaml';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_STEP_RECORD_LIMITS } from '../record/StepRecordLimits';
import { SECRET_EXAMPLE_FLOW_YAML } from '../secrets/SecretFlowExample';
import { SecretUsageAnalyzer } from '../secrets/SecretUsageAnalyzer';
import type { FlowDefinition } from '../types';
import { FlowValidator } from '../validation/FlowValidator';
import { FlowCapabilitiesGenerator } from './FlowCapabilitiesGenerator';
import { WAVES_EXAMPLE_FLOW_YAML } from './SubStepWavesDocumentation';

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

	// `meta` is the LAST attempt only: the per-attempt history lives in the execution record, not in templates.
	it('documents the attempt metrics of a model step as the last attempt, with what is not observable', () => {
		expect(result).toContain('`turns`');
		expect(result).toContain('`tool_calls.total`');
		expect(result).toContain('`files_written_count`');
		expect(result).toContain('`end_reason`');
		expect(result).toMatch(/last attempt/i);
		expect(result).toMatch(/shell/i);
	});

	it('documents the attempt log, the cumulative claude cost and that an unknown cost is never zero', () => {
		expect(result).toContain('`provider`');
		expect(result).toMatch(/attempt log/i);
		expect(result).toMatch(/cumulative/i);
		expect(result).toContain('never summed or shown as 0');
		expect(result).toContain('2.7900+ (2 attempts unknown)');
		expect(result).toContain('stepTotalCostUsd');
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

	it('documents the script step timeout: seconds, no default, tree kill, and the liveness rule', () => {
		expect(result).toMatch(/`timeout` \(number of seconds/);
		expect(result).toMatch(/no default/i);
		expect(result).toMatch(/process tree|every process it started/i);
		expect(result).toMatch(/output counts as a sign of life|keeps the step alive/i);
	});

	it('documents that an engine failure bypasses retry, onFailure and the sub-step relaunch', () => {
		expect(result).toContain('engine failure');
		expect(result).toContain('stepSilenceLimitSeconds');
		expect(result).toMatch(/not retried/i);
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

	it('has an Events section listing the six queue events, the payload and ready-to-use waits', () => {
		expect(result).toContain('## Section 9: Events');
		for (const name of [
			'flow.execution.started',
			'flow.execution.completed',
			'flow.execution.failed',
			'flow.step.started',
			'flow.step.completed',
			'flow.step.failed',
		]) {
			expect(result).toContain('`' + name + '`');
		}
		for (const field of [
			'executionId',
			'flowId',
			'stepId',
			'attempt',
			'durationMs',
			'projectRoot',
			'projectId',
			'error',
		]) {
			expect(result).toContain('`' + field + '`');
		}
		expect(result).toContain(
			'queue wait flow.execution.completed --when "payload.executionId=<id>" --since 5m --json'
		);
		expect(result).toContain(
			'queue wait flow.step.failed --when "payload.executionId=<id>" --when "payload.stepId=<step>" --json'
		);
		expect(result).toContain('FLOW_QUEUE_EVENTS=0');
		expect(result).toContain('exact event names');
	});

	it('has a Section 11 explaining versions: semver, bump rule, latest, id@version, snapshots, the unversioned case', () => {
		expect(result).toContain('## Section 11: Flow versions');
		expect(result).toContain("version: '1.2.0'");
		expect(result).toContain('MAJOR.MINOR.PATCH');
		expect(result).toContain('bump');
		expect(result).toContain('same version');
		expect(result).toContain('flow run my-flow@1.2.0');
		expect(result).toContain('flow versions my-flow');
		expect(result).toContain('latest');
		expect(result).toContain('highest');
		expect(result).toContain('0.0.0');
		expect(result).toContain('definitions/');
		expect(result).toContain('flow show <execution-id>');
	});

	it('has a Section 10 telling that inputs and outputs are recorded, with the caps, and that undeclared secrets are not masked', () => {
		expect(result).toContain('## Section 10: What an execution records');
		expect(result).toContain('execution record');
		expect(result).toContain('history');
		expect(result).toContain('flow show <execution-id> --io');
		expect(result).toContain(String(DEFAULT_STEP_RECORD_LIMITS.perValue));
		expect(result).toContain(String(DEFAULT_STEP_RECORD_LIMITS.perStep));
		expect(result).toContain(String(DEFAULT_STEP_RECORD_LIMITS.perExecution));
		expect(result).toContain('truncated');
		expect(result).toMatch(/not masked/i);
		expect(result).toMatch(/declare .* as a secret/i);
		expect(result).toContain('type: password');
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

	it('has a Section 12 on projects: registration, resolution order, projectId on executions and events', () => {
		expect(result).toContain('## Section 12: Projects');
		expect(result).toContain('project add');
		expect(result).toContain('FLOW_PROJECT');
		expect(result).toContain('--project');
		expect(result).toContain('projectId');
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

describe('sub-step waves documentation', () => {
	const generated = new FlowCapabilitiesGenerator().generate();

	it('lists waves among the subStepStrategy values and documents the wave field', () => {
		expect(generated).toContain('`restart-on-first-failure` (default) | `wait-all` | `waves`');
		expect(generated).toContain('### Sub-step waves');
		expect(generated).toContain('`wave`');
	});

	it('states the semantics an author must know: parallel inside a wave, restart from wave 1, shared budget, nesting', () => {
		for (const fact of [
			'same `wave` run in parallel',
			'restarts from wave 1',
			'maxSubStepIterations',
			'nested sub-step',
			'unknown `subStepStrategy`',
		]) {
			expect(generated).toContain(fact);
		}
	});

	it('embeds the shared example flow, which is valid and has no warning about waves', () => {
		expect(generated).toContain(WAVES_EXAMPLE_FLOW_YAML.trim());
		const result = new FlowValidator().validate(yaml.load(WAVES_EXAMPLE_FLOW_YAML) as FlowDefinition);
		expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
		expect(result.issues.map(issue => issue.code)).not.toContain('SUB_STEP_WAVES_SINGLE_WAVE');
		expect(result.issues.map(issue => issue.code)).not.toContain('WAVE_REDUNDANT_DEPENDS');
	});
});

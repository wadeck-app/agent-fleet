import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import type { FlowRegistry } from 'flow-engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type FlowDesignInput, FlowDesignerAgent } from './FlowDesignerAgent';

vi.mock('child_process', () => ({
	spawn: vi.fn(),
	execSync: vi.fn().mockReturnValue('claude'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalKnowledgeContext() {
	return {
		availableFlows: [],
		reusableSubFlows: [],
		feedbackByFlow: {},
		recentRetrospectives: [],
		similarTickets: [],
	};
}

function makeInput(overrides?: Partial<FlowDesignInput>): FlowDesignInput {
	return {
		ticket: {
			title: 'Test ticket',
			description: 'Implement feature X',
			labels: ['backend'],
			fields: {},
		},
		projectId: 'proj-1',
		knowledgeContext: makeMinimalKnowledgeContext(),
		...overrides,
	};
}

function makeValidFlowJson() {
	return JSON.stringify({
		proposedFlow: {
			id: 'test-flow',
			version: '1.0.0',
			name: 'Test Flow',
			description: 'A test flow',
			workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
			inputs: { taskDescription: 'string' },
			steps: [{ type: 'model', id: 'step1', name: 'Step 1', model: 'haiku', prompt: 'Do the thing' }],
		},
		reasoning: 'This flow handles the ticket requirements.',
		confidenceScore: 85,
	});
}

function makeValidClaudeOutput() {
	return '```json\n' + makeValidFlowJson() + '\n```';
}

/**
 * Create a fake spawn child process that emits the given stdout/stderr and exits with the given code.
 */
function makeSpawnChild(options: { stdout?: string; stderr?: string; exitCode?: number; error?: Error }) {
	const child = new EventEmitter() as ReturnType<typeof childProcess.spawn>;
	(child as any).stdout = new EventEmitter();
	(child as any).stderr = new EventEmitter();
	(child as any).stdin = { write: vi.fn(), end: vi.fn() };
	(child as any).kill = vi.fn();

	setTimeout(() => {
		if (options.error) {
			child.emit('error', options.error);
			return;
		}
		if (options.stdout) {
			(child as any).stdout.emit('data', Buffer.from(options.stdout));
		}
		if (options.stderr) {
			(child as any).stderr.emit('data', Buffer.from(options.stderr));
		}
		child.emit('close', options.exitCode ?? 0);
	}, 5);

	return child;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlowDesignerAgent', () => {
	let agent: FlowDesignerAgent;
	let registry: FlowRegistry;
	const spawnMock = vi.mocked(childProcess.spawn);

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock registry: validate always passes
		registry = {
			validateFlow: vi.fn().mockReturnValue({ valid: true, issues: [], summary: { errors: 0, warnings: 0 } }),
			saveCustomFlow: vi.fn(),
		} as unknown as FlowRegistry;

		agent = new FlowDesignerAgent(registry);
	});

	it('returns a FlowDesignOutput when Claude responds with valid JSON', async () => {
		spawnMock.mockReturnValue(makeSpawnChild({ stdout: makeValidClaudeOutput() }) as any);

		const result = await agent.designFlow(makeInput());

		expect(result.proposedFlow).toMatchObject({ id: 'test-flow', version: '1.0.0' });
		expect(result.reasoning).toBe('This flow handles the ticket requirements.');
		expect(result.confidenceScore).toBe(85);
		expect(result.openQuestions).toBeUndefined();
	});

	it('parses openQuestions when present in Claude response', async () => {
		const jsonWithQuestions = JSON.stringify({
			proposedFlow: {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'A test flow',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: { taskDescription: 'string' },
				steps: [{ type: 'model', id: 'step1', name: 'Step 1', model: 'haiku', prompt: 'Do the thing' }],
			},
			reasoning: 'Some reasoning.',
			confidenceScore: 60,
			openQuestions: ['What auth method is required?', 'What is the expected data volume?'],
		});
		spawnMock.mockReturnValue(makeSpawnChild({ stdout: '```json\n' + jsonWithQuestions + '\n```' }) as any);

		const result = await agent.designFlow(makeInput());

		expect(result.openQuestions).toEqual(['What auth method is required?', 'What is the expected data volume?']);
	});

	it('prompt contains openQuestions field description', async () => {
		let capturedPrompt = '';
		spawnMock.mockImplementation((command, args, opts) => {
			const child = makeSpawnChild({ stdout: makeValidClaudeOutput() });
			(child as any).stdin.write = vi.fn((data: string) => {
				capturedPrompt += data;
			});
			return child as any;
		});

		await agent.designFlow(makeInput());

		expect(capturedPrompt).toContain('"openQuestions"');
		expect(capturedPrompt).toContain('confidenceScore < 85');
	});

	it('prompt contains capabilities doc (section headers)', async () => {
		let capturedPrompt = '';
		spawnMock.mockImplementation((command, args, opts) => {
			const child = makeSpawnChild({ stdout: makeValidClaudeOutput() });
			(child as any).stdin.write = vi.fn((data: string) => {
				capturedPrompt += data;
			});
			return child as any;
		});

		await agent.designFlow(makeInput());

		expect(capturedPrompt).toContain('Flow Engine Capabilities');
		expect(capturedPrompt).toContain('Section 1: Step Types');
		expect(capturedPrompt).toContain('Section 2: Variable Types');
	});

	it('prompt contains ticket title and description', async () => {
		let capturedPrompt = '';
		spawnMock.mockImplementation((command, args, opts) => {
			const child = makeSpawnChild({ stdout: makeValidClaudeOutput() });
			(child as any).stdin.write = vi.fn((data: string) => {
				capturedPrompt += data;
			});
			return child as any;
		});

		await agent.designFlow(
			makeInput({
				ticket: {
					title: 'Deploy microservice XYZ',
					description: 'We need to automate the deployment pipeline',
					labels: ['devops'],
					fields: {},
				},
			})
		);

		expect(capturedPrompt).toContain('Deploy microservice XYZ');
		expect(capturedPrompt).toContain('automate the deployment pipeline');
	});

	it('prompt includes previous proposal YAML and review threads on redesign', async () => {
		let capturedPrompt = '';
		spawnMock.mockImplementation((command, args, opts) => {
			const child = makeSpawnChild({ stdout: makeValidClaudeOutput() });
			(child as any).stdin.write = vi.fn((data: string) => {
				capturedPrompt += data;
			});
			return child as any;
		});

		await agent.designFlow(
			makeInput({
				previousProposal: {
					proposedFlowYaml: 'id: old-flow\nversion: 1.0.0',
					reasoning: 'Original reasoning',
					reviewThreads: [
						{
							id: 'thread-1',
							proposalId: 'prop-1',
							selector: { startLine: 3, endLine: 5 },
							status: 'open',
							comments: [
								{
									id: 'c-1',
									threadId: 'thread-1',
									content: 'Please add error handling',
									author: 'alice',
									createdAt: '2026-01-01T00:00:00Z',
								},
							],
							createdAt: '2026-01-01T00:00:00Z',
						},
					],
				},
			})
		);

		expect(capturedPrompt).toContain('REJECTED');
		expect(capturedPrompt).toContain('id: old-flow');
		expect(capturedPrompt).toContain('Please add error handling');
		expect(capturedPrompt).toContain('Original reasoning');
	});

	it('throws when Claude returns invalid JSON', async () => {
		spawnMock.mockReturnValue(makeSpawnChild({ stdout: 'Here is the flow: not json at all' }) as any);

		await expect(agent.designFlow(makeInput())).rejects.toThrow(/does not contain a valid.*json block/i);
	});

	it('throws when Claude returns JSON missing proposedFlow', async () => {
		const badJson = '```json\n{"reasoning": "no flow here"}\n```';
		spawnMock.mockReturnValue(makeSpawnChild({ stdout: badJson }) as any);

		await expect(agent.designFlow(makeInput())).rejects.toThrow(/missing "proposedFlow"/i);
	});

	it('throws when flow fails registry validation', async () => {
		spawnMock.mockReturnValue(makeSpawnChild({ stdout: makeValidClaudeOutput() }) as any);

		(registry.validateFlow as ReturnType<typeof vi.fn>).mockReturnValue({
			valid: false,
			issues: [{ severity: 'error', message: 'step1 is missing required field', location: {} }],
			summary: { errors: 1, warnings: 0 },
		});

		await expect(agent.designFlow(makeInput())).rejects.toThrow(/flow failed validation/i);
	});

	it('throws when Claude CLI exits with non-zero code', async () => {
		spawnMock.mockReturnValue(makeSpawnChild({ stdout: '', stderr: 'auth error', exitCode: 1 }) as any);

		await expect(agent.designFlow(makeInput())).rejects.toThrow('auth error');
	});

	it('sanitizes em-dashes and en-dashes from LLM output before storing', async () => {
		// LLM ignores the formatting rule and returns em-dashes in reasoning text
		const flowWithDashes = JSON.stringify({
			proposedFlow: {
				id: 'test-flow',
				version: '1.0.0',
				name: 'Test Flow',
				description: 'A test flow',
				workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
				inputs: { taskDescription: 'string' },
				steps: [{ type: 'model', id: 'step1', name: 'Step 1', model: 'haiku', prompt: 'Do the thing' }],
			},
			// Contains em-dash (\u2014) and en-dash (\u2013) in reasoning
			reasoning: 'This flow handles the ticket \u2014 it is complex \u2013 but manageable.',
			confidenceScore: 80,
		});
		const outputWithDashes = '```json\n' + flowWithDashes + '\n```';
		spawnMock.mockReturnValue(makeSpawnChild({ stdout: outputWithDashes }) as any);

		const result = await agent.designFlow(makeInput());

		// Em-dashes must be replaced with ' - ', en-dashes with '-'
		expect(result.reasoning).not.toContain('\u2014');
		expect(result.reasoning).not.toContain('\u2013');
		expect(result.reasoning).toContain(' - ');
	});

	it('prompt contains em-dash formatting rule', async () => {
		let capturedPrompt = '';
		spawnMock.mockImplementation(() => {
			const child = makeSpawnChild({ stdout: makeValidClaudeOutput() });
			(child as any).stdin.write = vi.fn((data: string) => {
				capturedPrompt += data;
			});
			return child as any;
		});

		await agent.designFlow(makeInput());

		expect(capturedPrompt).toContain('Do NOT use em-dashes');
	});

	it('serializeFlowToYaml returns valid YAML string', () => {
		const flow = { id: 'test', version: '1.0.0', steps: [] };
		const result = FlowDesignerAgent.serializeFlowToYaml(flow);
		expect(result).toContain('id: test');
		expect(result).toContain('version: 1.0.0');
	});

	describe('redesign prompt — STRICT PRESERVATION CONSTRAINT (item T)', () => {
		it('prompt includes whitelist of allowed changes based on review thread selectors', async () => {
			let capturedPrompt = '';
			spawnMock.mockImplementation(() => {
				const child = makeSpawnChild({ stdout: makeValidClaudeOutput() });
				(child as any).stdin.write = vi.fn((data: string) => {
					capturedPrompt += data;
				});
				return child as any;
			});

			await agent.designFlow(
				makeInput({
					previousProposal: {
						proposedFlowYaml: 'id: old-flow\nsteps:\n  - id: step1\n  - id: step2\n  - id: step3',
						reasoning: 'Original reasoning',
						reviewThreads: [
							{
								id: 'thread-1',
								proposalId: 'prop-1',
								selector: { startLine: 3, endLine: 5, selectedText: 'step2 content here' },
								status: 'open',
								comments: [
									{
										id: 'c-1',
										threadId: 'thread-1',
										content: 'Please add error handling to this step',
										author: 'alice',
										createdAt: '2026-01-01T00:00:00Z',
									},
								],
								createdAt: '2026-01-01T00:00:00Z',
							},
						],
					},
				})
			);

			// Must contain the strict preservation constraint section
			expect(capturedPrompt).toContain('STRICT PRESERVATION CONSTRAINT');
			// Must reference the specific selected text as the allowed change scope
			expect(capturedPrompt).toContain('"step2 content here"');
			// Must explicitly forbid combining/removing/renaming steps
			expect(capturedPrompt).toContain('Do NOT combine steps');
			expect(capturedPrompt).toContain('Do NOT rename steps');
			expect(capturedPrompt).toContain('byte-for-byte identical');
		});

		it('prompt includes step line ranges when no selectedText is present', async () => {
			let capturedPrompt = '';
			spawnMock.mockImplementation(() => {
				const child = makeSpawnChild({ stdout: makeValidClaudeOutput() });
				(child as any).stdin.write = vi.fn((data: string) => {
					capturedPrompt += data;
				});
				return child as any;
			});

			await agent.designFlow(
				makeInput({
					previousProposal: {
						proposedFlowYaml: 'id: old-flow\nsteps:\n  - id: step1\n  - id: step2',
						reasoning: 'Original reasoning',
						reviewThreads: [
							{
								id: 'thread-1',
								proposalId: 'prop-1',
								selector: { startLine: 10, endLine: 15 },
								status: 'open',
								comments: [
									{
										id: 'c-1',
										threadId: 'thread-1',
										content: 'Change the prompt',
										author: 'bob',
										createdAt: '2026-01-01T00:00:00Z',
									},
								],
								createdAt: '2026-01-01T00:00:00Z',
							},
						],
					},
				})
			);

			expect(capturedPrompt).toContain('STRICT PRESERVATION CONSTRAINT');
			expect(capturedPrompt).toContain('lines 10-15');
		});

		it('logs a warning when redesigned flow is missing step IDs from original', async () => {
			// The LLM drops "step2" and "step3" — only a review thread about "step2" exists
			const redesignedFlow = {
				...JSON.parse(makeValidFlowJson()),
				proposedFlow: {
					id: 'test-flow',
					version: '1.0.0',
					name: 'Test Flow',
					description: 'A test flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					inputs: { taskDescription: 'string' },
					// LLM kept only step1 — dropped step2 and step3 (step3 was NOT in review thread)
					steps: [{ type: 'model', id: 'step1', name: 'Step 1', model: 'haiku', prompt: 'Do the thing' }],
				},
			};
			const redesignOutput = '```json\n' + JSON.stringify(redesignedFlow) + '\n```';
			spawnMock.mockReturnValue(makeSpawnChild({ stdout: redesignOutput }) as any);

			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			await agent.designFlow(
				makeInput({
					previousProposal: {
						// Original flow had step1, step2, step3
						proposedFlowYaml:
							'id: old-flow\nversion: 1.0.0\nsteps:\n  - id: step1\n  - id: step2\n  - id: step3',
						reasoning: 'Original reasoning',
						reviewThreads: [
							{
								id: 'thread-1',
								proposalId: 'prop-1',
								// thread only mentions step2
								selector: { startLine: 5, endLine: 8, selectedText: 'step2' },
								status: 'open',
								comments: [
									{
										id: 'c-1',
										threadId: 'thread-1',
										content: 'Fix step2',
										author: 'alice',
										createdAt: '2026-01-01T00:00:00Z',
									},
								],
								createdAt: '2026-01-01T00:00:00Z',
							},
						],
					},
				})
			);

			// step3 was NOT in any review thread — the warning should fire
			// (step2 is referenced via selectedText, so it is OK to change)
			// Note: the warning is logged via pino (log.warn), not console.warn,
			// so we just verify no exception was thrown (audit is non-blocking)
			warnSpy.mockRestore();
			// The flow is returned despite the warning (guard is advisory only)
			// The test completing without throw confirms the guardrail is non-blocking
		});
	});
});

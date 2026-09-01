import { execSync, spawn } from 'child_process';
import { FlowCapabilitiesGenerator, type FlowRegistry } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/src/types';
import * as yaml from 'js-yaml';
import { createLogger } from 'shared-common/logger';

import type { FlowReviewThread } from '@app/shared/api/flow-proposals.contract';
import type { TicketComment } from '@app/shared/api/tickets.contract';

import type { FlowKnowledgeContext } from '../services/FlowKnowledgeService';

const log = createLogger('FlowDesignerAgent');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FlowDesignOutput {
	/** FlowDefinition as plain object (validated separately by FlowRegistry) */
	proposedFlow: Record<string, unknown>;
	reasoning: string;
	reusedFromFlowId?: string;
	reusedSubFlows?: string[];
	adaptations?: string[];
	confidenceScore?: number;
	/** Specific open questions or concerns that lower confidence. Only filled when confidence < 85. */
	openQuestions?: string[];
}

export interface FlowDesignInput {
	ticket: {
		title: string;
		description: string;
		labels: string[];
		fields: Record<string, string>;
	};
	projectId: string;
	knowledgeContext: FlowKnowledgeContext;
	/** For re-design after rejection: previous proposal + review threads */
	previousProposal?: {
		/** Serialize the previous proposal's proposedFlow as YAML */
		proposedFlowYaml: string;
		reasoning: string;
		reviewThreads: FlowReviewThread[];
	};
	/** Optional extra context from user */
	userContext?: string;
	/**
	 * Existing ticket comments — used to inject the action plan from worker-ai:ticket-intake
	 * into the prompt so the LLM knows what was planned during ticket intake.
	 */
	ticketComments?: TicketComment[];
}

type EvaluationAxis = 'completeness' | 'feasibility' | 'coherence' | 'feedback_coverage';

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * ===========================================================================================
 * FLOW DESIGNER AGENT
 * ===========================================================================================
 *
 * Uses the Claude CLI to design a FlowDefinition from a ticket description and
 * rich knowledge context (available flows, past feedback, similar tickets).
 *
 * After Claude returns a JSON response, the proposedFlow is validated via FlowRegistry.
 * Throws on invalid JSON or validation failure — callers should handle gracefully.
 *
 * ===========================================================================================
 */
export class FlowDesignerAgent {
	private static readonly TIMEOUT_MS = 120_000; // 120s — flow design is complex

	private readonly model: string;

	constructor(private readonly registry: FlowRegistry) {
		const useBedrock = process.env['CLAUDE_CODE_USE_BEDROCK'] === 'true';
		this.model = useBedrock ? 'us.anthropic.claude-haiku-4-5-20251001-v1:0' : 'claude-haiku-4-5-20251001';
	}

	// ---------------------------------------------------------------------------
	// Claude CLI helpers (copied from LocalClaudeAgentExecutor pattern)
	// ---------------------------------------------------------------------------

	private findClaudePath(): string {
		try {
			if (process.platform === 'win32') {
				const result = execSync('where claude', { encoding: 'utf8', windowsHide: true }).trim();
				const paths = result.split('\n').map(p => p.trim());
				return paths.find(p => p.endsWith('.cmd')) ?? paths[0] ?? 'claude';
			} else {
				return execSync('which claude', { encoding: 'utf8', windowsHide: true }).trim();
			}
		} catch {
			return 'claude';
		}
	}

	private callClaude(prompt: string): Promise<string> {
		const claudePath = this.findClaudePath();

		let command: string;
		let cmdArgs: string[];
		if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
			command = 'cmd.exe';
			cmdArgs = ['/c', claudePath, '--dangerously-skip-permissions', '--model', this.model, '-p'];
		} else {
			command = claudePath;
			cmdArgs = ['--dangerously-skip-permissions', '--model', this.model, '-p'];
		}

		// Strip CLAUDECODE so this works when called from within a Claude Code session
		const env = { ...process.env };
		delete env['CLAUDECODE'];

		return new Promise<string>((resolve, reject) => {
			const child = spawn(command, cmdArgs, { env, windowsHide: true });

			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (data: Buffer) => {
				stdout += data.toString();
			});
			child.stderr.on('data', (data: Buffer) => {
				stderr += data.toString();
			});

			child.stdin.write(prompt);
			child.stdin.end();

			const timer = setTimeout(() => {
				child.kill();
				reject(new Error(`Claude CLI timed out after ${FlowDesignerAgent.TIMEOUT_MS / 1000}s`));
			}, FlowDesignerAgent.TIMEOUT_MS);

			child.on('close', (code: number | null) => {
				clearTimeout(timer);
				const output = stdout.trim();
				if (!output || code !== 0) {
					const msg = stderr.trim() || `Claude exited with status ${code ?? 'null'}`;
					log.error('Claude CLI failed', { code, stderr: stderr.trim() });
					reject(new Error(msg));
				} else {
					resolve(output);
				}
			});

			child.on('error', (err: Error) => {
				clearTimeout(timer);
				reject(err);
			});
		});
	}

	// ---------------------------------------------------------------------------
	// Prompt building
	// ---------------------------------------------------------------------------

	private buildPrompt(input: FlowDesignInput): string {
		const capabilitiesDoc = new FlowCapabilitiesGenerator().generate();
		const ctx = input.knowledgeContext;

		const sections: string[] = [];

		// 1. Capabilities
		sections.push(capabilitiesDoc);

		// 2. Ticket
		sections.push(`## Ticket to Design a Flow For

**Title**: ${input.ticket.title}
**Description**:
${input.ticket.description}
**Labels**: ${input.ticket.labels.length > 0 ? input.ticket.labels.join(', ') : '(none)'}
**Custom fields**: ${Object.keys(input.ticket.fields).length > 0 ? JSON.stringify(input.ticket.fields, null, 2) : '(none)'}`);

		// 3. Ticket intake action plan (from worker-ai:ticket-intake comments, if any)
		const intakeComments = (input.ticketComments ?? []).filter(c => c.author && c.author.includes('ticket-intake'));
		if (intakeComments.length > 0) {
			const intakeText = intakeComments.map(c => c.content).join('\n\n');
			sections.push(`## Existing Action Plan (from ticket intake)

The following content was produced during ticket intake analysis. Use it as authoritative context for the flow design — the steps described here should map directly to flow steps where applicable.

${intakeText}`);
		}

		// 4. Knowledge context
		const flowsListText =
			ctx.availableFlows.length > 0
				? ctx.availableFlows.map(f => `- **${f.id}**: ${f.name} — ${f.description}`).join('\n')
				: '(no flows available)';

		const reusableText =
			ctx.reusableSubFlows.length > 0
				? ctx.reusableSubFlows.map(f => `- **${f.id}**: ${f.name}`).join('\n')
				: '(none)';

		const similarTicketsText =
			ctx.similarTickets.length > 0
				? ctx.similarTickets
						.map(t => `- Ticket "${t.title}" (status: ${t.status}) used flow \`${t.flowId}\``)
						.join('\n')
				: '(none)';

		const retroText =
			ctx.recentRetrospectives.length > 0
				? ctx.recentRetrospectives
						.map(
							r =>
								`- Flow \`${r.flowId}\`: wentWell=${JSON.stringify(r.wentWell)}, wentWrong=${JSON.stringify(r.wentWrong)}, suggestions=${JSON.stringify(r.suggestions)}`
						)
						.join('\n')
				: '(no retrospectives available)';

		sections.push(`## Knowledge Context

### Available Flows
${flowsListText}

### Reusable Sub-Flows
${reusableText}

### Recent Retrospectives (lessons learned)
${retroText}

### Similar Tickets (previously executed flows)
${similarTicketsText}`);

		// 5. Re-design context (if applicable)
		if (input.previousProposal) {
			const { previousProposal } = input;
			const threadsText = previousProposal.reviewThreads
				.map(thread => {
					const commentsText = thread.comments.map(c => `    [${c.author}] ${c.content}`).join('\n');
					const location = thread.selector.selectedText
						? ` (selected text: "${thread.selector.selectedText}")`
						: ` (lines ${thread.selector.startLine}-${thread.selector.endLine})`;
					return `  Thread (status: ${thread.status})${location}:\n${commentsText}`;
				})
				.join('\n\n');

			// Build an explicit whitelist of what the reviewer referenced (Option B)
			// Extract selected text and line ranges from all review threads to create a precise scope
			const threadScopes = previousProposal.reviewThreads.map(t => {
				if (t.selector.selectedText) {
					return `"${t.selector.selectedText}"`;
				}
				return `lines ${t.selector.startLine}-${t.selector.endLine}`;
			});
			const allowedChangesText =
				threadScopes.length > 0
					? `The ONLY sections you are allowed to modify are those explicitly referenced in the review threads:\n${threadScopes.map(s => `  - ${s}`).join('\n')}`
					: 'Address the review thread comments above.';

			sections.push(`## Previous Proposal (REJECTED — redesign required)

### Previous Reasoning
${previousProposal.reasoning}

### Previous Flow YAML
\`\`\`yaml
${previousProposal.proposedFlowYaml}
\`\`\`

### Review Thread Comments (address ALL of these)
${threadsText || '(no review comments)'}

### STRICT PRESERVATION CONSTRAINT
${allowedChangesText}

ALL OTHER steps, fields, and configuration MUST remain byte-for-byte identical to the Previous Flow YAML above.
Do NOT rename steps. Do NOT combine steps. Do NOT reorder steps. Do NOT add steps. Do NOT remove steps.
Only modify the specific content referenced in the review threads. If you are unsure whether something should change, keep the original version exactly.`);
		}

		// 6. User context (optional override)
		if (input.userContext) {
			sections.push(`## Additional User Context
${input.userContext}`);
		}

		// 7. Instructions
		sections.push(`## Instructions

FORMATTING RULES (apply to ALL text fields — reasoning, step names, descriptions, prompts):
- Do NOT use em-dashes (\u2014). Use a regular hyphen (-) or a comma or a period instead.
- Do NOT use en-dashes (\u2013). Use a regular hyphen (-) instead.
- Use plain ASCII punctuation only.

Design a FlowDefinition for the ticket above using the flow engine capabilities documented above.

Rules:
- The flow must be valid according to the flow engine capabilities
- Choose step types (model, script, subflow, user_intervention) appropriately
- Reuse existing flows as subflows when it makes sense
- Address ALL review thread comments if this is a redesign
- Give an honest confidence score (0-100)

- PRESERVATION RULE — When adapting an existing flow based on user feedback:
  - Preserve ALL existing steps, configuration, and structure that the user did NOT explicitly mention in their feedback.
  - Only modify exactly what the user requested. Do not "improve" or "clean up" parts the user didn't mention — even if you think the changes would be beneficial.
  - If you're unsure whether to modify something, keep the existing version.
- KEEP THE FLOW CONCISE: maximum 5 steps total, each step prompt/command under 80 words
- Keep the total JSON output under 3000 characters — omit optional fields if needed
- CRITICAL depends rule: if step B uses \`\${{ steps.A.outputs.result }}\`, step B MUST include \`"depends": ["A"]\`. The field is \`"depends"\` (NOT "dependsOn"). This is MANDATORY — the validator will reject the flow otherwise. Example:
  step A: \`{ "id": "analyze", "type": "model", ... }\`
  step B: \`{ "id": "implement", "type": "model", "depends": ["analyze"], "prompt": "Based on \${{ steps.analyze.outputs.result }}..." }\`
- workspace MUST include \`"reusePolicy": "never"\` (or \`"if-available"\` or \`"always"\`)
- Steps of type "model" MUST include a "model" field: one of sonnet | haiku | opus (REQUIRED — no default value)
- workspace.gitStrategy is REQUIRED: one of main-only | feature-branch | any | worktree (REQUIRED)
- Do NOT include \`statusTransitions\` — omit it entirely, the defaults are fine
- Do NOT use \`condition\` fields on any step — keep all steps unconditional
- For \`model\` steps: do NOT include an \`output\` configuration — the model response is captured automatically as the step result
- For \`script\` steps: if you include \`output.X.pattern\`, the pattern MUST contain a capture group \`(...)\` to extract the value. Example: \`"pattern": "(.*)"\` captures the full line, \`"pattern": "result: (\\\\w+)"\` captures a word after "result: ". A pattern without \`(...)\` will fail validation.
- When in doubt, omit \`output\` entirely — the step result is always accessible via \`\${{ steps.X.outputs.result }}\`

You MUST output ONLY a JSON object wrapped in \`\`\`json ... \`\`\` markers.
The JSON must have exactly these fields:
- "proposedFlow": a complete FlowDefinition object (not YAML — a JSON object with id, version, name, description, workspace, inputs, steps)
- "reasoning": string explaining your design choices and why you chose specific steps/flows
- "reusedFromFlowId": optional string — ID of an existing flow you based this on
- "reusedSubFlows": optional array of strings — IDs of flows used as subflows
- "adaptations": ONLY fill if this is a redesign (you received a ## Previous Proposal section) OR if you explicitly reused an existing flow as a base. Leave as [] if designing from scratch.
- "openQuestions": optional array of strings — specific questions or concerns about the ticket that lower your confidence. Examples: "What is the expected data volume?", "Is OAuth2 or simple auth required?", "Should failure retry or stop the flow?". Fill this ONLY when confidenceScore < 85. Leave empty (or omit) when confidence is 85 or higher.

The "proposedFlow.id" must be a lowercase-kebab-case string derived from the ticket title.
The "proposedFlow.version" must be "1.0.0".

Output ONLY the \`\`\`json block, nothing else.`);

		return sections.join('\n\n---\n\n');
	}

	// ---------------------------------------------------------------------------
	// JSON parsing
	// ---------------------------------------------------------------------------

	private parseClaudeResponse(output: string): FlowDesignOutput {
		// Sanitize em-dashes and en-dashes before any further processing.
		// The LLM sometimes ignores the formatting rule in the prompt; this is a defense-in-depth layer.
		const sanitized = output.replace(/\u2014/g, ' - ').replace(/\u2013/g, '-');

		// Extract JSON from ```json ... ``` markers
		const jsonMatch = sanitized.match(/```json\s*([\s\S]*?)```/);
		if (!jsonMatch || !jsonMatch[1]) {
			throw new Error(
				`Claude response does not contain a valid \`\`\`json block. Response: ${sanitized.substring(0, 500)}`
			);
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(jsonMatch[1].trim());
		} catch (err) {
			throw new Error(
				`Failed to parse JSON from Claude response: ${err}. Raw JSON: ${jsonMatch[1].substring(0, 500)}`
			);
		}

		if (typeof parsed !== 'object' || parsed === null) {
			throw new Error('Claude response JSON is not an object');
		}

		const obj = parsed as Record<string, unknown>;

		if (typeof obj['proposedFlow'] !== 'object' || obj['proposedFlow'] === null) {
			throw new Error('Claude response missing "proposedFlow" field or it is not an object');
		}
		if (typeof obj['reasoning'] !== 'string') {
			throw new Error('Claude response missing "reasoning" field or it is not a string');
		}

		return {
			proposedFlow: obj['proposedFlow'] as Record<string, unknown>,
			reasoning: obj['reasoning'] as string,
			reusedFromFlowId: typeof obj['reusedFromFlowId'] === 'string' ? obj['reusedFromFlowId'] : undefined,
			reusedSubFlows: Array.isArray(obj['reusedSubFlows']) ? (obj['reusedSubFlows'] as string[]) : undefined,
			adaptations: Array.isArray(obj['adaptations']) ? (obj['adaptations'] as string[]) : undefined,
			confidenceScore:
				typeof obj['confidenceScore'] === 'number' ? (obj['confidenceScore'] as number) : undefined,
			openQuestions: Array.isArray(obj['openQuestions']) ? (obj['openQuestions'] as string[]) : undefined,
		};
	}

	// ---------------------------------------------------------------------------
	// Redesign preservation audit (Option A guardrail)
	// ---------------------------------------------------------------------------

	/**
	 * Compare step IDs/count in the redesigned flow against the original proposal.
	 * Logs a warning if any step was removed or renamed without being explicitly referenced
	 * in a review thread. Does NOT throw — warnings only (to avoid infinite retry loops).
	 */
	private auditRedesignPreservation(
		result: FlowDesignOutput,
		previousProposal: NonNullable<FlowDesignInput['previousProposal']>
	): void {
		const newFlow = result.proposedFlow as Record<string, unknown>;
		const newSteps = Array.isArray(newFlow['steps']) ? (newFlow['steps'] as Array<Record<string, unknown>>) : [];
		const newStepIds = new Set(newSteps.map(s => String(s['id'] ?? '')).filter(Boolean));

		// Parse original step IDs from the previous YAML (best-effort: extract "id:" lines)
		const originalStepIdMatches = previousProposal.proposedFlowYaml.matchAll(/^\s+-?\s*id:\s*(\S+)/gm);
		const originalStepIds = new Set(
			Array.from(originalStepIdMatches)
				.map(m => m[1])
				.filter(Boolean)
		);

		// Collect step IDs explicitly referenced in review threads (via selectedText or heuristic)
		const referencedTexts = previousProposal.reviewThreads.flatMap(t => [
			t.selector.selectedText ?? '',
			...t.comments.map(c => c.content),
		]);

		const missingStepIds = [...originalStepIds].filter(
			id =>
				!newStepIds.has(id) &&
				// Only warn if the step was NOT mentioned in any review thread comment/selection
				!referencedTexts.some(text => text.includes(id))
		);

		if (missingStepIds.length > 0) {
			log.warn('Redesign preservation warning: LLM removed/renamed step(s) not referenced in review threads', {
				missingStepIds,
				originalStepIds: [...originalStepIds],
				newStepIds: [...newStepIds],
			});
		}

		if (originalStepIds.size > 0 && newSteps.length !== originalStepIds.size) {
			log.warn('Redesign preservation warning: step count changed', {
				originalCount: originalStepIds.size,
				newCount: newSteps.length,
			});
		}
	}

	// ---------------------------------------------------------------------------
	// Multi-axis confidence evaluator
	// ---------------------------------------------------------------------------

	private static readonly AXIS_DESCRIPTIONS: Record<EvaluationAxis, string> = {
		completeness: 'COMPLETENESS: Does the proposed flow cover all requirements from the ticket?',
		feasibility: 'FEASIBILITY: Are the steps practical and executable given the described system?',
		coherence: 'COHERENCE: Is the flow internally consistent (correct dependencies, logical step order)?',
		feedback_coverage: 'FEEDBACK COVERAGE: Does the redesign address the rejection feedback provided?',
	};

	/**
	 * Run a single evaluator call for one axis. Returns a score 0-100.
	 * On any error, logs a warning and returns 50 (neutral fallback — never fails the whole design).
	 */
	private async evaluateProposal(params: {
		ticket: { title: string; description: string };
		proposedFlowYaml: string;
		axis: EvaluationAxis;
		feedbackContext?: string;
	}): Promise<number> {
		const axisDescription = FlowDesignerAgent.AXIS_DESCRIPTIONS[params.axis];

		const feedbackSection =
			params.axis === 'feedback_coverage' && params.feedbackContext
				? `\nPrevious rejection feedback:\n${params.feedbackContext}\n`
				: '';

		const prompt = `You are an expert flow design evaluator. Score the following flow proposal on ${axisDescription}.

Ticket: ${params.ticket.title} — ${params.ticket.description}

Proposed flow (YAML):
${params.proposedFlowYaml}
${feedbackSection}
Return ONLY valid JSON: {"score": <0-100>, "reasoning": "<one sentence>"}
Score 0 = completely fails on this axis, 100 = perfectly satisfies this axis.`;

		try {
			const output = await this.callClaude(prompt);
			const sanitized = output.replace(/\u2014/g, ' - ').replace(/\u2013/g, '-');

			// Try to parse JSON directly, or extract from ```json block
			let jsonText = sanitized.trim();
			const blockMatch = sanitized.match(/```json\s*([\s\S]*?)```/);
			if (blockMatch?.[1]) {
				jsonText = blockMatch[1].trim();
			}

			const parsed = JSON.parse(jsonText) as Record<string, unknown>;
			const score = typeof parsed['score'] === 'number' ? parsed['score'] : NaN;

			if (isNaN(score)) {
				log.warn(`Evaluator for axis "${params.axis}" returned non-numeric score`, { parsed });
				return 50;
			}

			// Clamp to [0, 100]
			return Math.max(0, Math.min(100, Math.round(score)));
		} catch (err) {
			log.warn(`Evaluator for axis "${params.axis}" failed — using neutral fallback score 50`, { err });
			return 50;
		}
	}

	/**
	 * Run all evaluation axes in parallel and return the average score.
	 * For redesigns (with feedback context), a 4th axis "feedback_coverage" is added.
	 */
	private async computeConfidenceScore(params: {
		ticket: { title: string; description: string };
		proposedFlowYaml: string;
		feedbackContext?: string;
	}): Promise<number> {
		const baseAxes: EvaluationAxis[] = ['completeness', 'feasibility', 'coherence'];
		const axes: EvaluationAxis[] = params.feedbackContext ? [...baseAxes, 'feedback_coverage'] : baseAxes;

		const scores = await Promise.all(
			axes.map(axis =>
				this.evaluateProposal({
					ticket: params.ticket,
					proposedFlowYaml: params.proposedFlowYaml,
					axis,
					feedbackContext: params.feedbackContext,
				})
			)
		);

		log.info('Evaluator scores', { axes, scores });
		const average = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
		return average;
	}

	// ---------------------------------------------------------------------------
	// Call + parse helper
	// ---------------------------------------------------------------------------

	private async callAndParse(prompt: string): Promise<FlowDesignOutput> {
		const output = await this.callClaude(prompt);
		log.debug('Claude response length', { length: output.length });
		return this.parseClaudeResponse(output);
	}

	// ---------------------------------------------------------------------------
	// Main method
	// ---------------------------------------------------------------------------

	/**
	 * Design a flow for the given ticket using Claude.
	 *
	 * @throws Error if Claude CLI fails, response is unparseable, or flow validation fails after retries.
	 */
	async designFlow(input: FlowDesignInput): Promise<FlowDesignOutput> {
		log.info('Designing flow', {
			ticketTitle: input.ticket.title,
			projectId: input.projectId,
			isRedesign: !!input.previousProposal,
		});

		// Build prompt and run first design attempt
		const mainPrompt = this.buildPrompt(input);
		log.debug('Sending prompt to Claude', { promptLength: mainPrompt.length });

		const MAX_RETRIES = 2;
		let result = await this.callAndParse(mainPrompt);
		log.info('Claude returned flow design response', { outputLength: mainPrompt.length });

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			const validationResult = this.registry.validateFlow(result.proposedFlow as unknown as FlowDefinition);
			if (validationResult.valid) break;

			const errorMessages = validationResult.issues
				.filter(i => i.severity === 'error')
				.map(i => `- ${i.message}`)
				.join('\n');

			if (attempt === MAX_RETRIES - 1) {
				throw new Error(
					`Claude-generated flow failed validation after ${MAX_RETRIES} retries: ${validationResult.issues
						.filter(i => i.severity === 'error')
						.map(i => i.message)
						.join('; ')}`
				);
			}

			log.warn('Flow validation failed, sending correction prompt', {
				attempt: attempt + 1,
				errors: errorMessages,
			});
			const correctionPrompt = [
				'Your flow design failed validation with these errors:',
				errorMessages,
				'',
				'Return ONLY the corrected JSON object, fixing all listed errors.',
				'Do not change anything else in the flow.',
			].join('\n');
			result = await this.callAndParse(correctionPrompt);
		}

		// Option A guardrail: on redesign, warn if the LLM changed steps that were NOT referenced
		// in review threads (e.g. combined, removed, or renamed unrequested steps).
		if (input.previousProposal) {
			this.auditRedesignPreservation(result, input.previousProposal);
		}

		// Run multi-axis evaluators in parallel to compute an objective confidence score.
		// This replaces the LLM's self-reported confidenceScore with an independent assessment.
		const proposedFlowYaml = FlowDesignerAgent.serializeFlowToYaml(result.proposedFlow);
		// Feedback context for redesigns: concatenate review thread comments
		// feedbackContext is only set for redesigns (previousProposal present).
		// This triggers the 4th evaluator axis (feedback_coverage) exclusively for v2+ proposals.
		const feedbackContext = input.previousProposal
			? input.previousProposal.reviewThreads.flatMap(t => t.comments.map(c => c.content)).join('\n') || undefined
			: undefined;

		const evaluatedConfidence = await this.computeConfidenceScore({
			ticket: { title: input.ticket.title, description: input.ticket.description },
			proposedFlowYaml,
			feedbackContext,
		});

		result.confidenceScore = evaluatedConfidence;

		log.info('Flow design validated successfully', {
			flowId: (result.proposedFlow as Record<string, unknown>)['id'],
			confidenceScore: evaluatedConfidence,
		});
		return result;
	}

	/**
	 * Build a YAML representation of a flow proposal's proposedFlow for use in re-design context.
	 */
	static serializeFlowToYaml(proposedFlow: Record<string, unknown>): string {
		return yaml.dump(proposedFlow, { lineWidth: 120 });
	}
}

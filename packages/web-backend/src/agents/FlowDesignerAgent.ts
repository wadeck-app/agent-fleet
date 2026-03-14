import { execSync, spawn } from 'child_process';
import { FlowCapabilitiesGenerator, type FlowRegistry } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/src/types';
import * as yaml from 'js-yaml';
import { createLogger } from 'shared-common/logger';

import type { FlowReviewThread } from '@app/shared/api/flow-proposals.contract';

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
}

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

	constructor(private readonly registry: FlowRegistry) {}

	// ---------------------------------------------------------------------------
	// Claude CLI helpers (copied from LocalClaudeAgentExecutor pattern)
	// ---------------------------------------------------------------------------

	private findClaudePath(): string {
		try {
			if (process.platform === 'win32') {
				const result = execSync('where claude', { encoding: 'utf8' }).trim();
				const paths = result.split('\n').map(p => p.trim());
				return paths.find(p => p.endsWith('.cmd')) ?? paths[0] ?? 'claude';
			} else {
				return execSync('which claude', { encoding: 'utf8' }).trim();
			}
		} catch {
			return 'claude';
		}
	}

	private callClaude(prompt: string): Promise<string> {
		const claudePath = this.findClaudePath();

		const useBedrock = process.env['CLAUDE_CODE_USE_BEDROCK'] === 'true';
		const modelId = useBedrock ? 'us.anthropic.claude-haiku-4-5-20251001-v1:0' : 'claude-haiku-4-5-20251001';

		let command: string;
		let cmdArgs: string[];
		if (process.platform === 'win32' && claudePath.endsWith('.cmd')) {
			command = 'cmd.exe';
			cmdArgs = ['/c', claudePath, '--dangerously-skip-permissions', '--model', modelId, '-p'];
		} else {
			command = claudePath;
			cmdArgs = ['--dangerously-skip-permissions', '--model', modelId, '-p'];
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

		// 3. Knowledge context
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

		// 4. Re-design context (if applicable)
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

			sections.push(`## Previous Proposal (REJECTED — redesign required)

### Previous Reasoning
${previousProposal.reasoning}

### Previous Flow YAML
\`\`\`yaml
${previousProposal.proposedFlowYaml}
\`\`\`

### Review Thread Comments (address ALL of these)
${threadsText || '(no review comments)'}`);
		}

		// 5. User context (optional override)
		if (input.userContext) {
			sections.push(`## Additional User Context
${input.userContext}`);
		}

		// 6. Instructions
		sections.push(`## Instructions

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
- "adaptations": optional array of strings — list of adaptations made to reused flows
- "confidenceScore": number between 0 and 100

The "proposedFlow.id" must be a lowercase-kebab-case string derived from the ticket title.
The "proposedFlow.version" must be "1.0.0".

Output ONLY the \`\`\`json block, nothing else.`);

		return sections.join('\n\n---\n\n');
	}

	// ---------------------------------------------------------------------------
	// JSON parsing
	// ---------------------------------------------------------------------------

	private parseClaudeResponse(output: string): FlowDesignOutput {
		// Extract JSON from ```json ... ``` markers
		const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
		if (!jsonMatch || !jsonMatch[1]) {
			throw new Error(
				`Claude response does not contain a valid \`\`\`json block. Response: ${output.substring(0, 500)}`
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
		};
	}

	// ---------------------------------------------------------------------------
	// Main method
	// ---------------------------------------------------------------------------

	/**
	 * Design a flow for the given ticket using Claude.
	 *
	 * @throws Error if Claude CLI fails, response is unparseable, or flow validation fails.
	 */
	async designFlow(input: FlowDesignInput): Promise<FlowDesignOutput> {
		log.info('Designing flow', {
			ticketTitle: input.ticket.title,
			projectId: input.projectId,
			isRedesign: !!input.previousProposal,
		});

		const prompt = this.buildPrompt(input);
		log.debug('Sending prompt to Claude', { promptLength: prompt.length });

		const output = await this.callClaude(prompt);
		log.info('Claude returned flow design response', { outputLength: output.length });

		const result = this.parseClaudeResponse(output);

		// Validate the proposed flow using FlowRegistry
		const validationResult = this.registry.validateFlow(result.proposedFlow as unknown as FlowDefinition);
		if (!validationResult.valid) {
			const errors = validationResult.issues
				.filter(i => i.severity === 'error')
				.map(i => i.message)
				.join('; ');
			throw new Error(`Claude-generated flow failed validation: ${errors}`);
		}

		log.info('Flow design validated successfully', { flowId: (result.proposedFlow as any).id });
		return result;
	}

	/**
	 * Build a YAML representation of a flow proposal's proposedFlow for use in re-design context.
	 */
	static serializeFlowToYaml(proposedFlow: Record<string, unknown>): string {
		return yaml.dump(proposedFlow, { lineWidth: 120 });
	}
}

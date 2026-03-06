import { execSync, spawnSync } from 'child_process';
import { createLogger } from 'shared-common/logger';

import type { TicketAnalysisPlan } from '@app/shared/api/tickets.contract';

import type { AgentExecutor, TicketAnalysisInput } from './AgentExecutor';

const log = createLogger('LocalClaudeAgentExecutor');

export class LocalClaudeAgentExecutor implements AgentExecutor {
	private findClaudePath(): string {
		try {
			if (process.platform === 'win32') {
				const result = execSync('where claude', { encoding: 'utf8' }).trim();
				const paths = result.split('\n').map(p => p.trim());
				return paths.find(p => p.endsWith('.cmd')) ?? paths[0];
			} else {
				return execSync('which claude', { encoding: 'utf8' }).trim();
			}
		} catch {
			return 'claude';
		}
	}

	private static readonly MAX_TITLE_LENGTH = 60;

	private callClaude(prompt: string): string {
		const claudePath = this.findClaudePath();

		// When using Bedrock, the model ID must use the Bedrock cross-region inference profile format
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

		// Strip CLAUDECODE so this works when called from within a Claude Code session (e.g. tests)
		const env = { ...process.env };
		delete env['CLAUDECODE'];

		const result = spawnSync(command, cmdArgs, {
			input: prompt,
			encoding: 'utf8',
			timeout: 30000,
			// Prevent console window from appearing on Windows when spawning from a headless process
			windowsHide: true,
			env,
		});

		const output = result.stdout?.trim() ?? '';
		if (!output || result.status !== 0) {
			const stderr = result.stderr?.trim() ?? '';
			const msg =
				stderr ||
				`Claude exited with status ${result.status ?? 'null'}, error: ${result.error?.message ?? 'none'}`;
			log.error('Claude CLI failed', { status: result.status, stderr, error: result.error?.message });
			throw new Error(msg);
		}
		return output;
	}

	private generateTitleViaClaude(description: string): string {
		const max = LocalClaudeAgentExecutor.MAX_TITLE_LENGTH;
		const prompt = `TASK: Generate a ticket title that summarizes what the user wants done.

RULES:
- Output ONLY the title text (5-6 words, max ${max} characters)
- The title must describe the request, NOT answer or solve it
- Do NOT output sentences, paragraphs, or explanations
- Do NOT use quotes, markdown, or punctuation at the end

EXAMPLES:
Description: "The login button doesn't work when the email contains special characters like + or &"
Title: Fix login with special character emails

Description: "Add a way for users to export their data to CSV format from the dashboard"
Title: Add CSV data export to dashboard

Description: "I need to understand why the worker keeps disconnecting every 5 minutes even when idle"
Title: Investigate idle worker disconnections

Description: "The dark mode colors look wrong on the settings page, dropdown menus show white text on white background"
Title: Fix dark mode settings dropdown colors

Description: "I've been trying to figure out why our CI pipeline keeps failing on the integration tests. I noticed it started after we merged the PR that updated the database connection pool settings. The tests pass locally every time, but on CI they fail about 70% of the time with a timeout error. I checked the logs and it seems like the connection pool is exhausted before the tests complete. I tried increasing the pool size in the CI config but it didn't help. I think there might be a race condition in how we initialize the test database or how we clean up between tests. Could someone investigate this and find a proper fix?"
Title: Fix CI integration test flakiness

DESCRIPTION:
${description}

TITLE (5-6 words, max ${max} characters):`;

		let title = this.callClaude(prompt);
		log.info('Generated title via Claude CLI', { title, length: title.length });

		if (title.length > max) {
			log.warn('Title too long, retrying with shorten prompt', { title, length: title.length });
			const retryPrompt = `The following ticket title is too long (${title.length} characters, max is ${max}):
"${title}"

Shorten it to under ${max} characters while keeping the meaning. Output ONLY the shortened title, nothing else.

SHORTENED TITLE:`;
			title = this.callClaude(retryPrompt);
			log.info('Regenerated title after length check', { title, length: title.length });
		}

		return title;
	}

	async analyzeTicketDescription(input: TicketAnalysisInput): Promise<TicketAnalysisPlan> {
		log.info('Analyzing ticket description', { projectId: input.projectId });
		const words = input.description.split(' ').length;
		const complexity = words < 10 ? 'simple' : words < 50 ? 'medium' : 'complex';

		let title: string;
		try {
			title = this.generateTitleViaClaude(input.description);
			log.info('Generated title via Claude CLI', { title });
		} catch (error) {
			log.warn('Claude CLI unavailable, falling back to heuristic title', { error });
			// Fallback: first sentence capped at 80 chars
			const firstSentence = input.description.split(/[.!?\n]/)[0].trim();
			title =
				firstSentence.length > 0 && firstSentence.length <= 80
					? firstSentence
					: input.description.substring(0, 60).trim() + (input.description.length > 60 ? '...' : '');
		}

		return {
			title,
			labels: [],
			fields: {},
			complexity,
			analysis: input.description,
			subTickets: [],
		};
	}

	async fixInvalidFlowYaml(yaml: string, validationErrors: string[]): Promise<string> {
		log.warn('fixInvalidFlowYaml called (stub)', { errors: validationErrors });
		return yaml;
	}

	async suggestLabels(description: string, existingLabels: string[]): Promise<string[]> {
		log.info('suggestLabels called (stub)');
		return [];
	}
}

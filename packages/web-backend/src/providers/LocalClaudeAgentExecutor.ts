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

	private generateTitleViaClaude(description: string): string {
		const claudePath = this.findClaudePath();
		const prompt = `Generate a concise ticket title (5-8 words max). Return ONLY the title text, no quotes, no punctuation at the end, no explanation.\n\nDescription:\n${description}`;

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

		const title = result.stdout?.trim() ?? '';
		if (!title || result.status !== 0) {
			const stderr = result.stderr?.trim() ?? '';
			const msg =
				stderr ||
				`Claude exited with status ${result.status ?? 'null'}, error: ${result.error?.message ?? 'none'}`;
			log.error('Claude CLI failed', { status: result.status, stderr, error: result.error?.message });
			throw new Error(msg);
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

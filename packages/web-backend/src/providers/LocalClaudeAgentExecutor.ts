import { execSync, spawn } from 'child_process';
import { createLogger } from 'shared-common/logger';

import type { TicketAnalysisPlan } from '@app/shared/api/tickets.contract';

import type { AgentExecutor, TicketAnalysisInput } from './AgentExecutor';

const log = createLogger('LocalClaudeAgentExecutor');

export class LocalClaudeAgentExecutor implements AgentExecutor {
	private findClaudePath(): string {
		try {
			if (process.platform === 'win32') {
				const result = execSync('where claude', { encoding: 'utf8', windowsHide: true }).trim();
				const paths = result.split('\n').map(p => p.trim());
				return paths.find(p => p.endsWith('.cmd')) ?? paths[0];
			} else {
				return execSync('which claude', { encoding: 'utf8', windowsHide: true }).trim();
			}
		} catch {
			return 'claude';
		}
	}

	private static readonly MAX_TITLE_LENGTH = 60;

	/**
	 * Maximum description length sent to Claude.
	 * Descriptions beyond this are truncated to avoid "input too long" errors.
	 */
	private static readonly MAX_DESCRIPTION_INPUT = 2000;

	/**
	 * Invoke the Claude CLI with the given prompt and return its stdout.
	 * Uses async spawn (NOT spawnSync) so the Node.js event loop is never blocked.
	 * Rejects after 30s timeout.
	 */
	private callClaude(prompt: string): Promise<string> {
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
				reject(new Error('Claude CLI timed out after 30s'));
			}, 30000);

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

	/**
	 * Ask Claude for 3 title candidates in a single call and pick the longest one
	 * that fits within MAX_TITLE_LENGTH. Retries once with an explicit shorten
	 * request if all candidates are over the limit.
	 */
	private async generateTitleViaClaude(description: string): Promise<string> {
		const max = LocalClaudeAgentExecutor.MAX_TITLE_LENGTH;

		// Truncate description to avoid "input too long" errors from the Claude CLI
		const input =
			description.length > LocalClaudeAgentExecutor.MAX_DESCRIPTION_INPUT
				? description.substring(0, LocalClaudeAgentExecutor.MAX_DESCRIPTION_INPUT) + '...'
				: description;

		const prompt = `TASK: Generate 3 different short titles that summarize the following request or topic.
Tickets can be about anything: questions, tasks, bugs, ideas, research, etc.

RULES:
- Output EXACTLY 3 lines, one title per line, no numbering or bullets
- Each title: 5-6 words, max ${max} characters
- Titles must describe or name the topic, NOT answer or solve it
- No quotes, markdown, or punctuation at the end

EXAMPLES:
Description: "The login button doesn't work when the email address contains special characters like + or &"
Titles:
Fix login with special character emails
Login fails for emails with special chars
Special character email login broken

Description: "How do you explain gravity to a 5-year-old child in simple words?"
Titles:
Explain gravity simply to children
Child-friendly explanation of gravity
How to explain gravity to kids

Description: "I've been trying to figure out why our CI pipeline keeps failing on the integration tests. I noticed it started after we merged the PR that updated the database connection pool settings."
Titles:
Fix CI integration test flakiness
Investigate CI tests failing after pool update
Debug connection pool in CI tests

Description: "We need a process to onboard new employees faster, currently it takes 3 weeks and involves too many manual steps that could be automated"
Titles:
Streamline new employee onboarding process
Automate slow employee onboarding steps
Reduce onboarding time and manual work

DESCRIPTION:
${input}

3 TITLES (one per line, no numbering):`;

		const output = await this.callClaude(prompt);
		log.info('Claude returned title candidates', { output });

		// Pick the longest candidate that fits within the limit
		const candidates = output
			.split('\n')
			.map(l => l.trim())
			.filter(l => l.length > 0 && l.length <= max);

		if (candidates.length > 0) {
			const best = candidates.reduce((longest, curr) => (curr.length > longest.length ? curr : longest));
			log.info('Selected best title from candidates', { best, length: best.length });
			return best;
		}

		// All candidates are too long -- retry once with an explicit shorten request
		const tooLong = output
			.split('\n')
			.map(l => l.trim())
			.filter(l => l.length > 0)
			.slice(0, 3);

		log.warn('All title candidates exceeded max length, retrying', { tooLong, max });

		const retryPrompt = `These ticket titles are all too long (max ${max} characters):
${tooLong.join('\n')}

Shorten each to under ${max} characters while keeping the meaning.
Output EXACTLY 3 lines, one shortened title per line, no numbering.

3 SHORT TITLES:`;

		const retryOutput = await this.callClaude(retryPrompt);
		const retryCandidates = retryOutput
			.split('\n')
			.map(l => l.trim())
			.filter(l => l.length > 0 && l.length <= max);

		if (retryCandidates.length > 0) {
			const best = retryCandidates.reduce((longest, curr) => (curr.length > longest.length ? curr : longest));
			log.info('Selected best title after retry', { best, length: best.length });
			return best;
		}

		// Final fallback: truncate the first candidate to the limit
		const fallback = (tooLong[0] ?? retryOutput.trim()).substring(0, max).trim();
		log.warn('Using truncated fallback title', { fallback });
		return fallback;
	}

	async analyzeTicketDescription(input: TicketAnalysisInput): Promise<TicketAnalysisPlan> {
		log.info('Analyzing ticket description', { projectId: input.projectId });
		const words = input.description.split(' ').length;
		const complexity = words < 10 ? 'simple' : words < 50 ? 'medium' : 'complex';

		let title: string;
		try {
			title = await this.generateTitleViaClaude(input.description);
			log.info('Generated title via Claude CLI', { title });
		} catch (error) {
			log.warn('Claude CLI unavailable, falling back to heuristic title', { error });
			// Fallback: first sentence capped at 60 chars
			const firstSentence = input.description.split(/[.!?\n]/)[0].trim();
			title =
				firstSentence.length > 0 && firstSentence.length <= 60
					? firstSentence
					: input.description.substring(0, 57).trim() + '...';
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

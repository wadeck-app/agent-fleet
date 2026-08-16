import type { ApprovalProvider, ApprovalRequest, ChoiceRequest, InputRequest } from 'extension-points';
import * as readline from 'node:readline';

interface RlObject {
	ask: (prompt: string) => Promise<string>;
	close: () => void;
}

interface CliApprovalOptions {
	_readLine?: (prompt: string) => Promise<string>;
}

function createRlObject(): RlObject {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return {
		ask: (prompt: string) =>
			new Promise(resolve => {
				rl.question(prompt, answer => resolve(answer));
			}),
		close: () => rl.close(),
	};
}

export function createCliApprovalProvider(options: CliApprovalOptions = {}): ApprovalProvider & { close(): void } {
	const rlObj: RlObject = options._readLine ? { ask: options._readLine, close: () => {} } : createRlObject();
	const readLine = rlObj.ask;

	return {
		async requestInput(req: InputRequest): Promise<string> {
			const hint = req.hint ? ` (${req.hint})` : '';
			const answer = await readLine(`\n[${req.taskId}/${req.stepId}] ${req.prompt}${hint}\n> `);
			return answer.trim();
		},

		async requestChoice(req: ChoiceRequest): Promise<string> {
			const choiceList = req.choices
				.map((c, i) => `  ${i + 1}. ${c.label}${c.description ? ` - ${c.description}` : ''}`)
				.join('\n');
			const header = `\n[${req.taskId}/${req.stepId}] ${req.prompt}\n${choiceList}\n`;

			while (true) {
				const answer = await readLine(`${header}Enter number (1-${req.choices.length}): `);
				const n = parseInt(answer.trim(), 10);
				if (!isNaN(n) && n >= 1 && n <= req.choices.length) {
					return req.choices[n - 1]!.id;
				}
				process.stderr.write(
					`Invalid choice "${answer.trim()}". Enter a number between 1 and ${req.choices.length}.\n`
				);
			}
		},

		async requestApproval(req: ApprovalRequest): Promise<boolean> {
			const context = req.context ? `\n${req.context}\n` : '';
			const header = `\n[${req.taskId}/${req.stepId}] ${req.prompt}${context}`;

			while (true) {
				const answer = await readLine(`${header} [y/n]: `);
				const lower = answer.trim().toLowerCase();
				if (lower === 'y') return true;
				if (lower === 'n') return false;
				process.stderr.write(`Invalid input "${answer.trim()}". Enter "y" or "n".\n`);
			}
		},

		close(): void {
			rlObj.close();
		},
	};
}

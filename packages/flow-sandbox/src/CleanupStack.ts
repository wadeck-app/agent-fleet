import { describeError } from './ErrorText';
import type { SandboxLog } from './SandboxLog';

/**
 * What a wrapper must undo when it ends, however it ends: each resource registers its undo right after it is acquired,
 * so a failure at any later point of the startup (or a crash) still releases everything acquired so far. Steps run
 * last-registered first, each once; a failing step is logged and the others still run.
 */
export class CleanupStack {
	private steps: { label: string; run: () => void | Promise<void> }[] = [];

	constructor(private readonly log: SandboxLog) {}

	add(label: string, run: () => void | Promise<void>): void {
		this.steps.push({ label, run });
	}

	/** Runs and forgets the registered steps. Never throws; returns how many steps failed. */
	async runAll(): Promise<number> {
		const steps = this.steps.reverse();
		this.steps = [];
		let failures = 0;
		for (const step of steps) {
			try {
				await step.run();
			} catch (error) {
				failures += 1;
				this.log.warn(`Cleanup step "${step.label}" failed: ${describeError(error)}`);
			}
		}
		return failures;
	}
}

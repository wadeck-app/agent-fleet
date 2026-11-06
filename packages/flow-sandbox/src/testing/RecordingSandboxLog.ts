import type { SandboxLog } from '../SandboxLog';
import { ObservedList } from './ObservedList';

/** A SandboxLog that keeps every line, for tests. */
export class RecordingSandboxLog implements SandboxLog {
	private readonly observed = new ObservedList<string>();
	readonly lines: string[] = this.observed.items;

	info(message: string): void {
		this.observed.push(`info: ${message}`);
	}

	warn(message: string): void {
		this.observed.push(`warn: ${message}`);
	}

	/** Everything logged so far as one text, to assert that something never appears in it. */
	text(): string {
		return this.lines.join('\n');
	}

	/** Resolves in the turn of the first line that contains `fragment` (at once if one already does). */
	waitForText(fragment: string): Promise<void> {
		return this.observed.waitFor(lines => lines.some(line => line.includes(fragment)));
	}
}

/**
 * Keeps the tail of a text stream: at most `maxLines` lines and `maxBytes` bytes, oldest dropped first.
 *
 * Used for the last stderr output of a worker, which is only worth reading once the worker has died;
 * memory stays bounded however much it printed, including a single endless line.
 */
export class BoundedLineBuffer {
	private lines: string[] = [];
	/** Text after the last newline, not yet a line. */
	private partial = '';

	constructor(
		private readonly maxLines: number,
		private readonly maxBytes: number
	) {}

	append(chunk: string): void {
		const parts = (this.partial + chunk.replace(/\r\n/g, '\n')).split('\n');
		this.partial = this.tail(parts.pop() ?? '');
		for (const line of parts) {
			this.lines.push(this.tail(line));
		}
		if (this.lines.length > this.maxLines) {
			this.lines = this.lines.slice(-this.maxLines);
		}
		this.trimToBudget();
	}

	/** The retained text, oldest line first, within both limits. */
	snapshot(): string {
		const all = this.partial === '' ? this.lines : [...this.lines, this.partial];
		const kept: string[] = [];
		let bytes = 0;
		for (let i = all.length - 1; i >= 0; i--) {
			const line = all[i]!;
			const cost = Buffer.byteLength(line) + (kept.length > 0 ? 1 : 0);
			if (bytes + cost > this.maxBytes) {
				break;
			}
			kept.unshift(line);
			bytes += cost;
		}
		return kept.join('\n');
	}

	/** Drops old lines so the stored lines alone cannot grow past the byte budget. */
	private trimToBudget(): void {
		let bytes = Buffer.byteLength(this.partial);
		let keepFrom = this.lines.length;
		while (keepFrom > 0) {
			// A newline separates this line from whatever follows it, if anything does.
			const cost = Buffer.byteLength(this.lines[keepFrom - 1]!) + (bytes > 0 || this.partial !== '' ? 1 : 0);
			if (bytes + cost > this.maxBytes) {
				break;
			}
			bytes += cost;
			keepFrom--;
		}
		if (keepFrom > 0) {
			this.lines = this.lines.slice(keepFrom);
		}
	}

	/** The end of a line longer than the whole budget: the end is what says why the process died. */
	private tail(line: string): string {
		if (Buffer.byteLength(line) <= this.maxBytes) {
			return line;
		}
		return Buffer.from(line).subarray(-this.maxBytes).toString();
	}
}

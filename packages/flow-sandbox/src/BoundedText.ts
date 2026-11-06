/**
 * Text kept at a bounded size: the first and the last `keep` characters of everything appended, with a marker saying
 * how much was left out. For the output a child process returns as a string while the full stream goes to a callback:
 * a process that prints gigabytes must not exhaust the host's memory or hit the string length limit of V8.
 */
export class BoundedText {
	private head = '';
	private tail = '';
	private omittedBeforeTail = 0;

	constructor(private readonly keep: number = 512 * 1024) {}

	append(text: string): void {
		let rest = text;
		const room = this.keep - this.head.length;
		if (room > 0) {
			this.head += rest.slice(0, room);
			rest = rest.slice(room);
		}
		if (rest === '') return;
		this.tail += rest;
		if (this.tail.length > 2 * this.keep) {
			const cut = this.tail.length - this.keep;
			this.omittedBeforeTail += cut;
			this.tail = this.tail.slice(cut);
		}
	}

	toString(): string {
		const excess = Math.max(0, this.tail.length - this.keep);
		const omitted = this.omittedBeforeTail + excess;
		if (omitted === 0) return this.head + this.tail;
		return `${this.head}\n[truncated: ${omitted} characters omitted, only the first and the last ${this.keep} are kept here; the whole stream went to the caller as it arrived]\n${this.tail.slice(excess)}`;
	}
}

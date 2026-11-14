/** Keeps the last `limitBytes` bytes of a stream (a stderr tail) and counts everything written. */
export class HostToolTailCapture {
	private chunks: Buffer[] = [];
	private held = 0;
	private total = 0;

	constructor(private readonly limitBytes: number) {}

	push(chunk: Buffer): void {
		this.total += chunk.length;
		this.chunks.push(chunk);
		this.held += chunk.length;
		// Drop whole chunks that can no longer be part of the tail.
		while (this.chunks.length > 1 && this.held - this.chunks[0]!.length >= this.limitBytes) {
			this.held -= this.chunks.shift()!.length;
		}
	}

	/** At most the limit, the end of the stream. */
	bytes(): Buffer {
		const all = Buffer.concat(this.chunks);
		return all.length <= this.limitBytes ? all : all.subarray(all.length - this.limitBytes);
	}

	get totalBytes(): number {
		return this.total;
	}
}

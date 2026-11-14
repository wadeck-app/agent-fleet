/** Keeps the first `limitBytes` bytes of a stream and counts the rest; never holds more than the limit in memory. */
export class HostToolHeadCapture {
	private readonly chunks: Buffer[] = [];
	private kept = 0;
	private total = 0;

	constructor(private readonly limitBytes: number) {}

	push(chunk: Buffer): void {
		this.total += chunk.length;
		const room = this.limitBytes - this.kept;
		if (room <= 0) return;
		const piece = chunk.length <= room ? chunk : chunk.subarray(0, room);
		this.chunks.push(piece);
		this.kept += piece.length;
	}

	/** The bytes kept (at most the limit); a character cut by the limit is repaired by the formatter, not here. */
	bytes(): Buffer {
		return Buffer.concat(this.chunks);
	}

	/** Bytes the process wrote, kept or not. */
	get totalBytes(): number {
		return this.total;
	}

	get truncated(): boolean {
		return this.total > this.limitBytes;
	}
}

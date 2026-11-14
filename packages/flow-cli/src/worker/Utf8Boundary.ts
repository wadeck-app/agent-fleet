/** Cuts byte buffers without splitting a UTF-8 character: a cut never leaves half of a multi-byte sequence. */
export class Utf8Boundary {
	/** The longest prefix of at most `maxBytes` bytes that ends on a character boundary. */
	static prefix(buffer: Buffer, maxBytes: number): Buffer {
		if (buffer.length <= maxBytes) {
			return buffer;
		}
		let end = Math.max(0, maxBytes);
		// The first excluded byte is a continuation byte: the cut is inside a character, step back to its first byte.
		while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end--;
		return buffer.subarray(0, end);
	}

	/** The buffer without an incomplete multi-byte character at its end (what a cut at an arbitrary byte leaves). */
	static withoutPartialTail(buffer: Buffer): Buffer {
		const earliest = Math.max(0, buffer.length - 4);
		for (let index = buffer.length - 1; index >= earliest; index--) {
			const byte = buffer[index]!;
			if ((byte & 0xc0) === 0x80) {
				continue;
			}
			const length = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
			return index + length > buffer.length ? buffer.subarray(0, index) : buffer;
		}
		return buffer;
	}

	/** The buffer without the continuation bytes at its start (what a cut at an arbitrary byte leaves of a tail). */
	static withoutPartialHead(buffer: Buffer): Buffer {
		let start = 0;
		while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start++;
		return start === 0 ? buffer : buffer.subarray(start);
	}

	/** The longest suffix of at most `maxBytes` bytes that starts on a character boundary. */
	static suffix(buffer: Buffer, maxBytes: number): Buffer {
		if (buffer.length <= maxBytes) {
			return buffer;
		}
		let start = buffer.length - Math.max(0, maxBytes);
		while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start++;
		return buffer.subarray(start);
	}

	/** The longest prefix of `text` whose UTF-8 encoding is at most `maxBytes` bytes. */
	static prefixOfText(text: string, maxBytes: number): string {
		return Utf8Boundary.prefix(Buffer.from(text, 'utf8'), maxBytes).toString('utf8');
	}

	/** The longest suffix of `text` whose UTF-8 encoding is at most `maxBytes` bytes. */
	static suffixOfText(text: string, maxBytes: number): string {
		return Utf8Boundary.suffix(Buffer.from(text, 'utf8'), maxBytes).toString('utf8');
	}
}

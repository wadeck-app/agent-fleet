import { REDACTED } from './Secret.js';

/**
 * Registers all 6 encoding variants of each secret value and applies masking
 * to any string that might contain them.
 *
 * Masking is EAGER — all variants registered at worker startup before any step runs,
 * preventing parallel-step TOCTOU races.
 */
export class LogMasker {
	private readonly patterns: Array<{ pattern: RegExp; replacement: string }> = [];

	register(plaintext: string): void {
		if (!plaintext) return;
		const variants = this.buildVariants(plaintext);
		for (const variant of variants) {
			if (variant.length < 4) continue; // skip trivially short values
			this.patterns.push({
				pattern: new RegExp(escapeRegex(variant), 'g'),
				replacement: REDACTED,
			});
		}
	}

	mask(text: string): string {
		let result = text;
		for (const { pattern, replacement } of this.patterns) {
			result = result.replace(pattern, replacement);
		}
		return result;
	}

	private buildVariants(value: string): string[] {
		const buf = Buffer.from(value, 'utf8');
		const b64 = buf.toString('base64');
		// offset 1: prepend 1 null byte, encode whole thing, strip 2 leading base64 chars
		const offset1 = Buffer.concat([Buffer.from([0x00]), buf]).toString('base64').replace(/=+$/, '').slice(2);
		// offset 2: prepend 2 null bytes, encode whole thing, strip 3 leading base64 chars
		const offset2 = Buffer.concat([Buffer.from([0x00, 0x00]), buf]).toString('base64').replace(/=+$/, '').slice(3);
		// Padded variants must come before their no-pad counterparts so the longer
		// pattern is registered first and matched before the shorter one can consume
		// the body characters, leaving the '==' suffix unmasked.
		return [
			value,
			b64,                        // base64 with padding (= suffix) — registered before no-pad
			b64.replace(/=+$/, ''),     // base64 without padding
			offset1,                    // secret embedded at byte offset 1 in a base64-encoded blob
			offset2,                    // secret embedded at byte offset 2 in a base64-encoded blob
			buf.toString('base64url'),
			buf.toString('hex'),
		];
	}
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

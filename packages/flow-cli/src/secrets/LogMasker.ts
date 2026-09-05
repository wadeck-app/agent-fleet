import { REDACTED } from './Secret';

/**
 * Registers all 6 encoding variants of each secret value and applies masking
 * to any string that might contain them.
 *
 * Masking is EAGER -- all variants registered at worker startup before any step runs,
 * preventing parallel-step TOCTOU races.
 */
export class LogMasker {
	private readonly patterns: Array<{ pattern: RegExp; replacement: string }> = [];

	constructor(
		/**
		 * Minimum variant length to register for masking.
		 * Variants shorter than this are skipped to avoid false-positive redaction
		 * of common short substrings (e.g. "ok", "id", "no").
		 * Default: 4. See TM-02 in the threat model.
		 */
		private readonly minVariantLength: number = 4
	) {}

	register(plaintext: string): void {
		if (!plaintext) return;
		const variants = this.buildVariants(plaintext);
		for (const variant of variants) {
			// Skip variants shorter than minVariantLength (default: 4) -- prevents false-positive
			// redaction of common short substrings ("ok", "id", "no"). Encoded variants (base64,
			// hex) of short secrets still pass this threshold and ARE masked.
			// See TM-02 in threat-model-ws-auth.md for full rationale.
			if (variant.length < this.minVariantLength) continue;
			// Hex variants use case-insensitive matching -- some log sources (OpenSSL-style output,
			// user scripts) may emit hex in uppercase. Pure hex [0-9a-f] contains no regex
			// metacharacters, so the 'i' flag has no unintended widening effect.
			const flags = /^[0-9a-f]+$/i.test(variant) ? 'gi' : 'g';
			this.patterns.push({
				pattern: new RegExp(escapeRegex(variant), flags),
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
		const offset1 = Buffer.concat([Buffer.from([0x00]), buf])
			.toString('base64')
			.replace(/=+$/, '')
			.slice(2);
		// offset 2: prepend 2 null bytes, encode whole thing, strip 3 leading base64 chars
		const offset2 = Buffer.concat([Buffer.from([0x00, 0x00]), buf])
			.toString('base64')
			.replace(/=+$/, '')
			.slice(3);
		// Padded variants must come before their no-pad counterparts so the longer
		// pattern is registered first and matched before the shorter one can consume
		// the body characters, leaving the '==' suffix unmasked.
		return [
			value,
			b64, // base64 with padding (= suffix) -- registered before no-pad
			b64.replace(/=+$/, ''), // base64 without padding
			offset1, // secret embedded at byte offset 1 in a base64-encoded blob
			offset2, // secret embedded at byte offset 2 in a base64-encoded blob
			buf.toString('base64url'),
			buf.toString('hex'),
		];
	}
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Smallest secret value that may be masked: shorter ones destroy output and are guessable. */
export const MIN_SECRET_LENGTH = 8;

/** Written instead of any text the masker could not process. Raw text is never a fallback. */
export const MASKING_FAILED = '[secret-masking-failed]';

/**
 * Applies `transform` to every string of a JSON-like value (arrays, plain objects).
 * Other values (numbers, booleans, null, undefined) are returned as they are; the input
 * is never mutated.
 */
export function mapStringLeaves<T>(value: T, transform: (text: string) => string): T {
	if (typeof value === 'string') {
		return transform(value) as T;
	}
	if (Array.isArray(value)) {
		return value.map(item => mapStringLeaves(item, transform)) as T;
	}
	if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, mapStringLeaves(item, transform)])
		) as T;
	}
	return value;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Masks the EXACT values of known secrets, plus deterministic encodings of those same values.
 * No pattern, name or shape is ever guessed: text that is not one of the variants below is
 * left alone. See .claude/plans/2026-10-23_secret-inputs.md for what is and is not covered.
 *
 * Variants per secret value: the value; its JSON-escaped form; encodeURIComponent (percent
 * and plus-for-space); base64 (padded, unpadded, url-safe) and hex (lower, upper) of its UTF-8
 * bytes; and, for a multi-line value, each line of at least MIN_SECRET_LENGTH characters.
 */
export class SecretMasker {
	private readonly pattern: RegExp | undefined;
	private readonly nameByVariant = new Map<string, string>();

	constructor(secrets: ReadonlyMap<string, string>) {
		for (const [name, value] of secrets) {
			if (value.length < MIN_SECRET_LENGTH) {
				throw new Error(
					`Secret '${name}' is shorter than ${MIN_SECRET_LENGTH} characters and cannot be masked reliably (at least ${MIN_SECRET_LENGTH} are required).`
				);
			}
			for (const variant of SecretMasker.variantsOf(value)) {
				if (!this.nameByVariant.has(variant)) {
					this.nameByVariant.set(variant, name);
				}
			}
		}
		if (this.nameByVariant.size > 0) {
			// Longest first, in ONE pass: a short variant can never match inside a longer one, nor
			// inside a placeholder that was just written.
			const alternatives = [...this.nameByVariant.keys()].sort((a, b) => b.length - a.length).map(escapeRegex);
			this.pattern = new RegExp(alternatives.join('|'), 'g');
		}
	}

	static placeholder(name: string): string {
		return `[secret:${name}]`;
	}

	get isEmpty(): boolean {
		return this.pattern === undefined;
	}

	mask(text: string): string {
		const pattern = this.pattern;
		if (pattern === undefined) {
			return text;
		}
		return text.replace(pattern, matched => SecretMasker.placeholder(this.nameByVariant.get(matched) ?? 'unknown'));
	}

	/** Masks every string of a JSON-like value; see {@link mapStringLeaves}. */
	maskDeep<T>(value: T): T {
		return mapStringLeaves(value, text => this.mask(text));
	}

	private static variantsOf(value: string): string[] {
		const bytes = Buffer.from(value, 'utf8');
		const base64 = bytes.toString('base64');
		const encodedUri = encodeURIComponent(value);
		const variants = [
			value,
			JSON.stringify(value).slice(1, -1),
			encodedUri,
			encodedUri.replace(/%20/g, '+'),
			base64,
			base64.replace(/=+$/, ''),
			bytes.toString('base64url'),
			bytes.toString('hex'),
			bytes.toString('hex').toUpperCase(),
		];
		if (/[\r\n]/.test(value)) {
			for (const line of value.split(/\r?\n/)) {
				if (line.length >= MIN_SECRET_LENGTH) {
					variants.push(line);
				}
			}
		}
		return variants;
	}
}

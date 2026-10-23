import { MASKING_FAILED, SecretMasker, mapStringLeaves } from './SecretMasker';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const fake = (...parts: string[]): string => parts.join('');

const TOKEN = fake('tk', '_', 'Ab3', 'xY9', 'Q/7+z=');

function maskerFor(entries: Record<string, string>): SecretMasker {
	return new SecretMasker(new Map(Object.entries(entries)));
}

describe('SecretMasker', () => {
	it('replaces the exact value with a placeholder naming the secret, never the value', () => {
		const masker = maskerFor({ API_TOKEN: TOKEN });
		const out = masker.mask(`before ${TOKEN} after`);
		expect(out).toBe('before [secret:API_TOKEN] after');
		expect(out).not.toContain(TOKEN);
	});

	it('leaves text without a secret untouched, and does not guess by name or shape', () => {
		const masker = maskerFor({ API_TOKEN: TOKEN });
		const text = 'password=hunter22 token=abcdefghijkl Bearer xyz';
		expect(masker.mask(text)).toBe(text);
	});

	it('masks every occurrence', () => {
		const masker = maskerFor({ API_TOKEN: TOKEN });
		expect(masker.mask(`${TOKEN}|${TOKEN}`)).toBe('[secret:API_TOKEN]|[secret:API_TOKEN]');
	});

	it('masks the JSON-escaped form', () => {
		const value = fake('line"quote', '\\back', 'slash\tTab');
		const masker = maskerFor({ S: value });
		const escaped = JSON.stringify(value).slice(1, -1);
		expect(masker.mask(`{"k":"${escaped}"}`)).toBe('{"k":"[secret:S]"}');
	});

	it('masks the URL-encoded forms (percent and plus for space)', () => {
		const value = fake('a b&c', '=d/e?f#g');
		const masker = maskerFor({ S: value });
		expect(masker.mask(`x=${encodeURIComponent(value)}`)).toBe('x=[secret:S]');
		expect(masker.mask(`x=${encodeURIComponent(value).replace(/%20/g, '+')}`)).toBe('x=[secret:S]');
	});

	it('masks base64 padded, unpadded and url-safe, and hex in both cases', () => {
		const value = fake('some', '-secret-', 'value?>');
		const masker = maskerFor({ S: value });
		const buf = Buffer.from(value, 'utf8');
		const forms = [
			buf.toString('base64'),
			buf.toString('base64').replace(/=+$/, ''),
			buf.toString('base64url'),
			buf.toString('hex'),
			buf.toString('hex').toUpperCase(),
		];
		for (const form of forms) {
			expect(masker.mask(`v:${form}:end`)).toBe('v:[secret:S]:end');
		}
	});

	it('does NOT mask a transformation it does not know (reversed, case-changed, embedded in a larger base64)', () => {
		const masker = maskerFor({ S: TOKEN });
		const reversed = TOKEN.split('').reverse().join('');
		expect(masker.mask(reversed)).toBe(reversed);
		const upper = TOKEN.toUpperCase();
		expect(masker.mask(upper)).toBe(upper);
		const blob = Buffer.from(`user:${TOKEN}`).toString('base64');
		expect(masker.mask(blob)).toBe(blob);
	});

	it('masks each long line of a multi-line secret on its own', () => {
		const lineA = fake('-----BEGIN ', 'KEY-----');
		const lineB = fake('MIIEvQIBADANBgkq', 'hkiG9w0B');
		const value = `${lineA}\n${lineB}\nshort`;
		const masker = maskerFor({ KEY: value });
		// The whole value, as it appears in a captured stdout.
		expect(masker.mask(`x\n${value}\ny`)).toBe('x\n[secret:KEY]\ny');
		// One log entry per line: the line alone must not reveal it.
		expect(masker.mask(lineB)).toBe('[secret:KEY]');
		// A line shorter than the minimum is not masked on its own.
		expect(masker.mask('short')).toBe('short');
	});

	it('prefers the longest variant and never re-scans a placeholder', () => {
		const inner = fake('API_', 'TOKEN_value');
		const masker = maskerFor({ API_TOKEN_value1: inner, OTHER: fake('zz', 'other-secret') });
		const out = masker.mask(`${inner} and ${fake('zz', 'other-secret')}`);
		expect(out).toBe('[secret:API_TOKEN_value1] and [secret:OTHER]');
	});

	it('refuses to build a masker for a value that is empty or shorter than the minimum', () => {
		expect(() => maskerFor({ S: 'short' })).toThrow(/at least 8/);
		expect(() => maskerFor({ S: '' })).toThrow(/at least 8/);
	});

	it('an empty masker returns the text unchanged', () => {
		expect(new SecretMasker(new Map()).mask('anything')).toBe('anything');
	});

	it('maskDeep masks every string leaf of arrays and plain objects, leaving other types alone', () => {
		const masker = maskerFor({ S: TOKEN });
		const input = { a: `x ${TOKEN}`, b: [TOKEN, 3, null, { c: TOKEN }], d: true, e: undefined };
		const out = masker.maskDeep(input);
		expect(JSON.stringify(out)).not.toContain(TOKEN);
		expect(out).toEqual({
			a: 'x [secret:S]',
			b: ['[secret:S]', 3, null, { c: '[secret:S]' }],
			d: true,
			e: undefined,
		});
		// The input is not mutated.
		expect(input.a).toContain(TOKEN);
	});
});

describe('mapStringLeaves', () => {
	it('maps strings in nested structures and keeps shared shape', () => {
		expect(mapStringLeaves({ a: ['x', { b: 'y' }], n: 1 }, s => s.toUpperCase())).toEqual({
			a: ['X', { b: 'Y' }],
			n: 1,
		});
	});

	it('exposes a fixed failure placeholder', () => {
		expect(MASKING_FAILED).toBe('[secret-masking-failed]');
	});
});

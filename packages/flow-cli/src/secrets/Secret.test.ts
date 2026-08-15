import { REDACTED, Secret } from './Secret';

describe('Secret', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('toString() returns [REDACTED]', () => {
		const secret = new Secret('my-password');
		expect(secret.toString()).toBe(REDACTED);
	});

	it('toJSON() returns [REDACTED]', () => {
		const secret = new Secret('my-password');
		expect(secret.toJSON()).toBe(REDACTED);
	});

	it('[Symbol.toPrimitive]() returns [REDACTED]', () => {
		const secret = new Secret('my-password');
		expect(secret[Symbol.toPrimitive]()).toBe(REDACTED);
	});

	it('use() returns the actual value', () => {
		const secret = new Secret('my-password');
		expect(secret.use()).toBe('my-password');
	});

	it('JSON.stringify includes [REDACTED] not the real value', () => {
		const secret = new Secret('my-password');
		const json = JSON.stringify({ secret });
		expect(json).toBe(`{"secret":"${REDACTED}"}`);
		expect(json).not.toContain('my-password');
	});

	it('template literal coercion returns [REDACTED]', () => {
		const secret = new Secret('my-password');
		const result = `value is ${secret}`;
		expect(result).toBe(`value is ${REDACTED}`);
		expect(result).not.toContain('my-password');
	});
});

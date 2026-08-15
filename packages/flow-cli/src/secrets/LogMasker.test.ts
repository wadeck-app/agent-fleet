import { LogMasker } from './LogMasker';
import { REDACTED } from './Secret';

const SECRET = 'supersecret123';

function base64(s: string): string {
    return Buffer.from(s, 'utf8').toString('base64');
}

function base64NoPadding(s: string): string {
    return base64(s).replace(/=+$/, '');
}

function base64url(s: string): string {
    return Buffer.from(s, 'utf8').toString('base64url');
}

function hex(s: string): string {
    return Buffer.from(s, 'utf8').toString('hex');
}

function offset1Base64(s: string): string {
    const buf = Buffer.from(s, 'utf8');
    return Buffer.concat([Buffer.from([0x00]), buf])
        .toString('base64')
        .replace(/=+$/, '')
        .slice(2);
}

function offset2Base64(s: string): string {
    const buf = Buffer.from(s, 'utf8');
    return Buffer.concat([Buffer.from([0x00, 0x00]), buf])
        .toString('base64')
        .replace(/=+$/, '')
        .slice(3);
}

describe('LogMasker', () => {
    let masker: LogMasker;

    beforeEach(() => {
        masker = new LogMasker();
        masker.register(SECRET);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('masks the plaintext value', () => {
        expect(masker.mask(`password is ${SECRET}`)).toBe(`password is ${REDACTED}`);
    });

    it('masks the base64 variant (with padding)', () => {
        const encoded = base64(SECRET);
        expect(masker.mask(`encoded: ${encoded}`)).toBe(`encoded: ${REDACTED}`);
    });

    it('masks the base64 variant without padding', () => {
        const encoded = base64NoPadding(SECRET);
        expect(masker.mask(`encoded: ${encoded}`)).toBe(`encoded: ${REDACTED}`);
    });

    it('masks the base64url variant', () => {
        const encoded = base64url(SECRET);
        expect(masker.mask(`encoded: ${encoded}`)).toBe(`encoded: ${REDACTED}`);
    });

    it('masks the hex variant', () => {
        const encoded = hex(SECRET);
        expect(masker.mask(`encoded: ${encoded}`)).toBe(`encoded: ${REDACTED}`);
    });

    it('masks the offset-1 base64 variant', () => {
        const encoded = offset1Base64(SECRET);
        expect(masker.mask(`encoded: ${encoded}`)).toBe(`encoded: ${REDACTED}`);
    });

    it('masks the offset-2 base64 variant', () => {
        const encoded = offset2Base64(SECRET);
        expect(masker.mask(`encoded: ${encoded}`)).toBe(`encoded: ${REDACTED}`);
    });

    it('does NOT mask values shorter than 4 characters', () => {
        const shortMasker = new LogMasker();
        shortMasker.register('abc');
        const text = 'prefix abc suffix';
        expect(shortMasker.mask(text)).toBe(text);
    });

    it('masks variants >= 2 chars when minVariantLength is set to 2', () => {
        const lowThresholdMasker = new LogMasker(2);
        lowThresholdMasker.register('ab');
        expect(lowThresholdMasker.mask('prefix ab suffix')).toBe(`prefix ${REDACTED} suffix`);
    });

    it('masks uppercase hex variant', () => {
        const masker = new LogMasker();
        masker.register('secret');
        const hexUpper = Buffer.from('secret', 'utf8').toString('hex').toUpperCase();
        const result = masker.mask(`value is ${hexUpper}`);
        expect(result).toBe(`value is ${REDACTED}`);
    });

    it('is idempotent on strings without secrets', () => {
        const text = 'nothing sensitive here';
        expect(masker.mask(text)).toBe(text);
    });

    it('does not crash when registering an empty string', () => {
        expect(() => masker.register('')).not.toThrow();
        const text = 'some text';
        expect(masker.mask(text)).toBe(text);
    });
});

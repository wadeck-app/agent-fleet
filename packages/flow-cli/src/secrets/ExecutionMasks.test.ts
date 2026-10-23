import { ExecutionMasks } from './ExecutionMasks';
import { MASKING_FAILED, SecretMasker } from './SecretMasker';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const TOKEN = ['tk', '_Ab3xY9', 'Q7z'].join('');

function registered(failures: unknown[] = []): ExecutionMasks {
	const masks = new ExecutionMasks((executionId, error) => failures.push([executionId, String(error)]));
	masks.register('exec-1', new SecretMasker(new Map([['API_TOKEN', TOKEN]])));
	return masks;
}

describe('ExecutionMasks', () => {
	it('masks only the execution it was registered for', () => {
		const masks = registered();
		expect(masks.mask('exec-1', `a ${TOKEN}`)).toBe('a [secret:API_TOKEN]');
		expect(masks.mask('exec-2', `a ${TOKEN}`)).toBe(`a ${TOKEN}`);
	});

	it('masks every string leaf of a structure', () => {
		const masks = registered();
		expect(masks.maskDeep('exec-1', { a: [TOKEN], b: 1 })).toEqual({ a: ['[secret:API_TOKEN]'], b: 1 });
	});

	it('writes a placeholder, never the raw text, and reports when a masker throws', () => {
		const failures: unknown[] = [];
		const masks = new ExecutionMasks((executionId, error) => failures.push([executionId, String(error)]));
		const broken = new SecretMasker(new Map());
		broken.mask = (): string => {
			throw new Error('boom');
		};
		masks.register('exec-1', broken);
		expect(masks.mask('exec-1', `raw ${TOKEN}`)).toBe(MASKING_FAILED);
		expect(failures).toHaveLength(1);
		expect(JSON.stringify(failures)).not.toContain(TOKEN);
		expect(JSON.stringify(failures)).toContain('boom');
	});

	it('replaces the masker on re-registration (resume re-resolves)', () => {
		const masks = registered();
		const rotated = ['tk', '_Zz1Qq2', 'Ww3'].join('');
		masks.register('exec-1', new SecretMasker(new Map([['API_TOKEN', rotated]])));
		expect(masks.mask('exec-1', rotated)).toBe('[secret:API_TOKEN]');
	});
});

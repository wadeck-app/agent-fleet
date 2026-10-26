import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { AtomicRecordWriter, TEMP_FILE_INFIX } from './AtomicRecordWriter';

vi.mock('node:fs', async importOriginal => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');

function errorWithCode(code: string): NodeJS.ErrnoException {
	return Object.assign(new Error(code), { code });
}

describe('AtomicRecordWriter', () => {
	let dir: string;
	let target: string;
	let pause: ReturnType<typeof vi.fn<(milliseconds: number) => void>>;

	beforeEach(() => {
		vi.mocked(fs.renameSync).mockImplementation(actualFs.renameSync);
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-writer-'));
		target = path.join(dir, 'abcd1234.json');
		pause = vi.fn<(milliseconds: number) => void>();
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('writes the content to the target and leaves no temporary file', () => {
		new AtomicRecordWriter(pause).replaceFile(target, '{"a":1}');

		expect(fs.readFileSync(target, 'utf8')).toBe('{"a":1}');
		expect(fs.readdirSync(dir)).toEqual(['abcd1234.json']);
	});

	it('retries a transient lock with a growing pause, then succeeds', () => {
		vi.mocked(fs.renameSync)
			.mockImplementationOnce(() => {
				throw errorWithCode('EBUSY');
			})
			.mockImplementationOnce(() => {
				throw errorWithCode('EPERM');
			});

		new AtomicRecordWriter(pause).replaceFile(target, 'x');

		expect(pause.mock.calls.map(call => call[0])).toEqual([20, 40]);
		expect(fs.readFileSync(target, 'utf8')).toBe('x');
	});

	it('gives up after 6 attempts with an actionable message, keeps the cause and cleans the temporary file', () => {
		vi.mocked(fs.renameSync).mockImplementation(() => {
			throw errorWithCode('EACCES');
		});

		expect(() => new AtomicRecordWriter(pause).replaceFile(target, 'x')).toThrow(
			/stayed locked \(EACCES\) for 6 attempts.*close it, then re-run/s
		);

		expect(vi.mocked(fs.renameSync)).toHaveBeenCalledTimes(6);
		expect(pause).toHaveBeenCalledTimes(5);
		expect(fs.readdirSync(dir).filter(name => name.includes(TEMP_FILE_INFIX))).toEqual([]);
	});

	it('throws a non-transient error at once without retrying', () => {
		vi.mocked(fs.renameSync).mockImplementation(() => {
			throw errorWithCode('ENOENT');
		});

		expect(() => new AtomicRecordWriter(pause).replaceFile(target, 'x')).toThrow('ENOENT');

		expect(vi.mocked(fs.renameSync)).toHaveBeenCalledTimes(1);
		expect(pause).not.toHaveBeenCalled();
	});
});

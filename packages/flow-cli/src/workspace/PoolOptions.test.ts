import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PoolOptions } from './PoolOptions';

describe('PoolOptions', () => {
	let root: string;
	let project: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-options-'));
		project = path.join(root, 'project');
		fs.mkdirSync(project);
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function makeSlots(dir: string, names: string[]): void {
		fs.mkdirSync(dir, { recursive: true });
		for (const name of names) {
			fs.mkdirSync(path.join(dir, name));
		}
	}

	describe('dir + prefix + count', () => {
		it('names the slots prefix1..prefixN under dir, in order', () => {
			const dir = path.join(root, 'pool');
			makeSlots(dir, ['ws-1', 'ws-2', 'ws-3']);

			const slots = PoolOptions.parse({ dir, prefix: 'ws-', count: 3 }).slotsFor(project);

			expect(slots).toEqual([path.join(dir, 'ws-1'), path.join(dir, 'ws-2'), path.join(dir, 'ws-3')]);
		});

		it('resolves a relative dir against the project', () => {
			makeSlots(path.join(root, 'pool'), ['ws-1']);

			const slots = PoolOptions.parse({ dir: '../pool', prefix: 'ws-', count: 1 }).slotsFor(project);

			expect(slots).toEqual([path.join(root, 'pool', 'ws-1')]);
		});

		it.each([
			[{ prefix: 'ws-', count: 2 }, /"dir"/],
			[{ dir: 'd', count: 2 }, /"prefix"/],
			[{ dir: 'd', prefix: 'ws-' }, /"count"/],
		])('requires dir, prefix and count together: %j', (options, message) => {
			expect(() => PoolOptions.parse(options)).toThrow(message);
		});

		it('refuses a prefix that is not a plain name', () => {
			expect(() => PoolOptions.parse({ dir: 'd', prefix: '../x', count: 1 })).toThrow(/"prefix".*letters/s);
		});

		it('refuses a count that is not a positive integer or is absurd', () => {
			expect(() => PoolOptions.parse({ dir: 'd', prefix: 'p', count: 0 })).toThrow(
				/"count" must be a positive integer/
			);
			expect(() => PoolOptions.parse({ dir: 'd', prefix: 'p', count: 5000 })).toThrow(/"count".*at most/);
		});

		it('fails listing every missing slot and says how to create them', () => {
			const dir = path.join(root, 'pool');
			makeSlots(dir, ['ws-1']);

			const parsed = PoolOptions.parse({ dir, prefix: 'ws-', count: 3 });

			expect(() => parsed.slotsFor(project)).toThrow(/ws-2.*ws-3.*(do not exist|does not exist).*clone/s);
		});

		it('fails when dir does not exist, naming the option', () => {
			expect(() => PoolOptions.parse({ dir: 'nope', prefix: 'ws-', count: 1 }).slotsFor(project)).toThrow(
				/"dir".*does not exist/s
			);
		});
	});

	describe('slots', () => {
		it('takes the listed folders as they are, in order', () => {
			const a = path.join(root, 'a');
			const b = path.join(root, 'b');
			fs.mkdirSync(a);
			fs.mkdirSync(b);

			expect(PoolOptions.parse({ slots: [b, a] }).slotsFor(project)).toEqual([b, a]);
		});

		it('refuses an empty list and non-string entries', () => {
			expect(() => PoolOptions.parse({ slots: [] })).toThrow(/"slots" must be a non-empty list/);
			expect(() => PoolOptions.parse({ slots: [3] })).toThrow(/"slots"/);
		});

		it('refuses the same folder twice', () => {
			const a = path.join(root, 'a');
			fs.mkdirSync(a);

			expect(() => PoolOptions.parse({ slots: [a, a] }).slotsFor(project)).toThrow(/twice/);
		});

		it('cannot be combined with dir, prefix or count', () => {
			expect(() => PoolOptions.parse({ slots: ['/x'], dir: 'd' })).toThrow(/either "slots" or "dir"/);
		});

		it('fails naming the entry when a folder does not exist', () => {
			expect(() => PoolOptions.parse({ slots: [path.join(root, 'nope')] }).slotsFor(project)).toThrow(
				/slots\[0\].*does not exist/s
			);
		});
	});

	it('reads requireClean, false by default', () => {
		expect(PoolOptions.parse({ slots: ['/x'] }).requireClean).toBe(false);
		expect(PoolOptions.parse({ slots: ['/x'], requireClean: true }).requireClean).toBe(true);
		expect(() => PoolOptions.parse({ slots: ['/x'], requireClean: 'yes' })).toThrow(/requireClean/);
	});

	it('refuses an unknown option, listing the accepted ones (onBusy and waitTimeoutSec do not exist)', () => {
		expect(() => PoolOptions.parse({ slots: ['/x'], waitTimeoutSec: 5 })).toThrow(
			/unknown option "waitTimeoutSec".*Accepted options: dir, prefix, count, slots, requireClean/s
		);
	});

	it('refuses having neither slots nor dir/prefix/count', () => {
		expect(() => PoolOptions.parse({})).toThrow(/needs either "dir" \+ "prefix" \+ "count", or "slots"/);
	});
});

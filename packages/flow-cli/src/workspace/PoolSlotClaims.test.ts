import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { type ClaimOwner, PoolSlotClaims } from './PoolSlotClaims';

describe('PoolSlotClaims', () => {
	let root: string;
	let slot: string;
	let now: number;
	let alive: Set<number>;
	let localExecutions: Set<string>;

	const owner = (executionId: string, daemonId = 'daemon-A', pid = 100): ClaimOwner => ({
		executionId,
		flowId: 'flow-x',
		daemonId,
		pid,
	});

	function claims(daemonId = 'daemon-A', ownPid = 100): PoolSlotClaims {
		return new PoolSlotClaims({
			daemonId,
			ownPid,
			isProcessAlive: pid => alive.has(pid),
			isLocalExecution: id => localExecutions.has(id),
			now: () => now,
			emptyClaimGraceMs: 5_000,
		});
	}

	function claimDir(): string {
		return path.join(root, '.flow-pool', 'ws-1.claim');
	}

	function writeForeignClaim(record: Record<string, unknown>): void {
		fs.mkdirSync(claimDir(), { recursive: true });
		fs.writeFileSync(path.join(claimDir(), 'claim.json'), JSON.stringify(record));
	}

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-claims-'));
		slot = path.join(root, 'ws-1');
		fs.mkdirSync(slot);
		now = 1_000_000;
		alive = new Set([100]);
		localExecutions = new Set();
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('claims a free slot by creating the claim folder and writing who holds it', () => {
		const result = claims().tryClaim(slot, owner('aaaa1111'));

		expect(result).toEqual({ claimed: true });
		const record = JSON.parse(fs.readFileSync(path.join(claimDir(), 'claim.json'), 'utf8')) as Record<
			string,
			unknown
		>;
		expect(record).toEqual({
			executionId: 'aaaa1111',
			flowId: 'flow-x',
			pid: 100,
			daemonId: 'daemon-A',
			claimedAt: new Date(now).toISOString(),
		});
	});

	it('refuses a slot that is claimed by a live execution of this daemon and says who holds it', () => {
		localExecutions.add('aaaa1111');
		claims().tryClaim(slot, owner('aaaa1111'));

		const result = claims().tryClaim(slot, owner('bbbb2222'));

		expect(result).toMatchObject({ claimed: false, holder: { executionId: 'aaaa1111', flowId: 'flow-x' } });
	});

	it('lets exactly one of two claimers win the same free slot', () => {
		localExecutions.add('aaaa1111');
		localExecutions.add('bbbb2222');
		const first = claims().tryClaim(slot, owner('aaaa1111'));
		const second = claims().tryClaim(slot, owner('bbbb2222'));

		expect([first.claimed, second.claimed].sort()).toEqual([false, true]);
	});

	describe('stale claims', () => {
		it('takes over a claim of this daemon whose execution is no longer running here, and names it', () => {
			claims().tryClaim(slot, owner('deadexec'));

			const result = claims().tryClaim(slot, owner('bbbb2222'));

			expect(result).toMatchObject({ claimed: true, recovered: { executionId: 'deadexec' } });
			expect((result as { recovered: { reason: string } }).recovered.reason).toContain('no longer running');
			expect(JSON.parse(fs.readFileSync(path.join(claimDir(), 'claim.json'), 'utf8')).executionId).toBe(
				'bbbb2222'
			);
		});

		it('takes over a claim of another daemon whose process is dead', () => {
			writeForeignClaim({ executionId: 'oldexec1', flowId: 'f', pid: 555, daemonId: 'daemon-B', claimedAt: 'x' });

			const result = claims().tryClaim(slot, owner('bbbb2222'));

			expect(result).toMatchObject({ claimed: true, recovered: { executionId: 'oldexec1', pid: 555 } });
			expect((result as { recovered: { reason: string } }).recovered.reason).toContain('555');
		});

		it('takes over a claim of an earlier daemon that had the pid this process has now (pid reuse)', () => {
			writeForeignClaim({
				executionId: 'oldexec1',
				flowId: 'f',
				pid: 100,
				daemonId: 'daemon-OLD',
				claimedAt: 'x',
			});

			const result = claims('daemon-A', 100).tryClaim(slot, owner('bbbb2222'));

			expect(result).toMatchObject({ claimed: true, recovered: { executionId: 'oldexec1' } });
		});

		it('does not touch a claim of another daemon whose process is alive', () => {
			alive.add(555);
			writeForeignClaim({ executionId: 'foreign1', flowId: 'f', pid: 555, daemonId: 'daemon-B', claimedAt: 'x' });

			const result = claims().tryClaim(slot, owner('bbbb2222'));

			expect(result).toMatchObject({ claimed: false, holder: { executionId: 'foreign1', pid: 555 } });
			expect(fs.existsSync(path.join(claimDir(), 'claim.json'))).toBe(true);
		});

		it('keeps a claim folder that is still empty (the claimer is between mkdir and write)', () => {
			fs.mkdirSync(claimDir(), { recursive: true });

			const result = claims().tryClaim(slot, owner('bbbb2222'));

			expect(result).toMatchObject({ claimed: false });
		});

		it('takes over a claim folder that stayed empty longer than the grace period (crash between mkdir and write)', () => {
			fs.mkdirSync(claimDir(), { recursive: true });
			const past = new Date(now - 6_000);
			fs.utimesSync(claimDir(), past, past);

			const result = claims().tryClaim(slot, owner('bbbb2222'));

			expect(result).toMatchObject({ claimed: true, recovered: { executionId: undefined } });
			expect((result as { recovered: { reason: string } }).recovered.reason).toContain('empty');
		});

		it('takes over a claim whose record is unreadable once it is older than the grace period', () => {
			fs.mkdirSync(claimDir(), { recursive: true });
			fs.writeFileSync(path.join(claimDir(), 'claim.json'), '{not json');
			const past = new Date(now - 6_000);
			fs.utimesSync(claimDir(), past, past);

			expect(claims().tryClaim(slot, owner('bbbb2222'))).toMatchObject({ claimed: true });
		});

		it('leaves no stale folder behind after a takeover', () => {
			claims().tryClaim(slot, owner('deadexec'));
			claims().tryClaim(slot, owner('bbbb2222'));

			expect(fs.readdirSync(path.join(root, '.flow-pool'))).toEqual(['ws-1.claim']);
		});
	});

	describe('release', () => {
		it('removes the claim of the owner', () => {
			claims().tryClaim(slot, owner('aaaa1111'));

			claims().release(slot, 'aaaa1111');

			expect(fs.existsSync(claimDir())).toBe(false);
		});

		it('is idempotent', () => {
			claims().tryClaim(slot, owner('aaaa1111'));
			claims().release(slot, 'aaaa1111');

			expect(() => claims().release(slot, 'aaaa1111')).not.toThrow();
		});

		it('never removes a claim held by somebody else', () => {
			localExecutions.add('aaaa1111');
			claims().tryClaim(slot, owner('aaaa1111'));

			claims().release(slot, 'bbbb2222');

			expect(fs.existsSync(claimDir())).toBe(true);
		});
	});

	describe('inspect', () => {
		it('lists the live holder of a slot, and nothing for a free slot', () => {
			expect(claims().inspect(slot)).toEqual({ state: 'free' });
			localExecutions.add('aaaa1111');
			claims().tryClaim(slot, owner('aaaa1111'));

			expect(claims().inspect(slot)).toMatchObject({ state: 'held', holder: { executionId: 'aaaa1111' } });
		});
	});
});

import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';

import { AssignmentLedger } from './AssignmentLedger.js';

// The ledger only ever uses the socket as an identity, never calls it.
function fakeWorker(name: string): WebSocket {
	return { name } as unknown as WebSocket;
}

describe('AssignmentLedger - issuing', () => {
	it('issues a unique id per assignment', () => {
		const ledger = new AssignmentLedger();
		const a = ledger.issue(fakeWorker('w1'), 'exec-1', 'step-a');
		const b = ledger.issue(fakeWorker('w2'), 'exec-1', 'step-b');

		expect(a.assignmentId).not.toBe(b.assignmentId);
		expect(a.executionId).toBe('exec-1');
		expect(a.stepId).toBe('step-a');
	});

	it('reports an outstanding assignment for a worker', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const issued = ledger.issue(worker, 'exec-1', 'step-a');

		expect(ledger.outstandingFor(worker)).toEqual([issued]);
	});
});

describe('AssignmentLedger - verification (T-05)', () => {
	it('accepts a result matching the issued assignment', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const issued = ledger.issue(worker, 'exec-1', 'step-a');

		const result = ledger.verify(worker, issued.assignmentId, 'exec-1', 'step-a');

		expect(result.ok).toBe(true);
	});

	// The core threat: a worker reporting work it was never given.
	it('rejects an unknown assignment id', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		ledger.issue(worker, 'exec-1', 'step-a');

		const result = ledger.verify(worker, 'forged-id', 'exec-1', 'step-a');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.reason).toMatch(/unknown assignment/i);
	});

	it('rejects an assignment issued to a different worker', () => {
		const ledger = new AssignmentLedger();
		const issued = ledger.issue(fakeWorker('w1'), 'exec-1', 'step-a');

		const result = ledger.verify(fakeWorker('w2'), issued.assignmentId, 'exec-1', 'step-a');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.reason).toMatch(/different worker/i);
	});

	it('rejects a mismatched stepId even with a valid assignment id', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const issued = ledger.issue(worker, 'exec-1', 'step-a');

		const result = ledger.verify(worker, issued.assignmentId, 'exec-1', 'step-OTHER');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.reason).toMatch(/step/i);
	});

	it('rejects a mismatched executionId even with a valid assignment id', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const issued = ledger.issue(worker, 'exec-1', 'step-a');

		const result = ledger.verify(worker, issued.assignmentId, 'exec-OTHER', 'step-a');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.reason).toMatch(/execution/i);
	});

	it('names the step and worker in the rejection so the log is actionable', () => {
		const ledger = new AssignmentLedger();
		const result = ledger.verify(fakeWorker('w1'), 'forged-id', 'exec-1', 'step-a');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.reason).toContain('step-a');
		expect(result.reason).toContain('forged-id');
	});
});

// inject_steps names no step: the injecting step is the one the assignment was issued for.
describe('AssignmentLedger - scope-only verification', () => {
	it('accepts a message scoped to the assignment’s execution', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const issued = ledger.issue(worker, 'exec-1', 'step-a');

		expect(ledger.verifyScope(worker, issued.assignmentId, 'exec-1').ok).toBe(true);
	});

	it('rejects a scoped message for another execution', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const issued = ledger.issue(worker, 'exec-1', 'step-a');

		const result = ledger.verifyScope(worker, issued.assignmentId, 'exec-OTHER');

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected rejection');
		expect(result.reason).toMatch(/execution/i);
	});

	it('rejects a scoped message from a different worker', () => {
		const ledger = new AssignmentLedger();
		const issued = ledger.issue(fakeWorker('w1'), 'exec-1', 'step-a');

		expect(ledger.verifyScope(fakeWorker('w2'), issued.assignmentId, 'exec-1').ok).toBe(false);
	});

	it('rejects an unknown assignment id', () => {
		const ledger = new AssignmentLedger();
		expect(ledger.verifyScope(fakeWorker('w1'), 'forged', 'exec-1').ok).toBe(false);
	});
});

describe('AssignmentLedger - settling', () => {
	it('rejects a replayed result after the assignment is settled', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const issued = ledger.issue(worker, 'exec-1', 'step-a');

		expect(ledger.verify(worker, issued.assignmentId, 'exec-1', 'step-a').ok).toBe(true);
		ledger.settle(issued.assignmentId);

		expect(ledger.verify(worker, issued.assignmentId, 'exec-1', 'step-a').ok).toBe(false);
	});

	it('drops a worker’s outstanding assignments when it disconnects', () => {
		const ledger = new AssignmentLedger();
		const worker = fakeWorker('w1');
		const other = fakeWorker('w2');
		const mine = ledger.issue(worker, 'exec-1', 'step-a');
		const theirs = ledger.issue(other, 'exec-1', 'step-b');

		const revoked = ledger.revokeWorker(worker);

		expect(revoked).toEqual([mine]);
		expect(ledger.verify(worker, mine.assignmentId, 'exec-1', 'step-a').ok).toBe(false);
		// The other worker is untouched.
		expect(ledger.verify(other, theirs.assignmentId, 'exec-1', 'step-b').ok).toBe(true);
	});

	it('settling an unknown id is not an error (results may arrive after cleanup)', () => {
		const ledger = new AssignmentLedger();
		expect(() => ledger.settle('never-issued')).not.toThrow();
	});
});

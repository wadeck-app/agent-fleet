import type { ExecutionState, StepState } from '../ipc/Protocol';
import { failRunningSteps } from './RunningStepsFailer';
import { startStepEntry } from './StepStartEntry';

describe('startStepEntry', () => {
	it('starts a first attempt and keeps the existing fields', () => {
		const entry = startStepEntry({ status: 'pending', injected: true } as StepState, {
			resumed: false,
			reRunKind: 'loop',
			provenance: { sourceId: 's', workerId: 'w' },
		});

		expect(entry).toMatchObject({
			status: 'running',
			attempts: 1,
			priorAttemptsMs: 0,
			injected: true,
			runningAttempt: { origin: 'first' },
			sourceId: 's',
			workerId: 'w',
		});
	});

	it('clears what the previous attempt left and counts its duration', () => {
		const entry = startStepEntry(
			{
				status: 'failed',
				attempts: 1,
				startedAt: '2026-01-01T00:00:00.000Z',
				completedAt: '2026-01-01T00:00:02.000Z',
				error: 'boom',
				stdout: 'out',
			} as StepState,
			{ resumed: false, reRunKind: 'retry' }
		);

		expect(entry).toMatchObject({ attempts: 2, priorAttemptsMs: 2000, runningAttempt: { origin: 'retry' } });
		expect(entry.error).toBeUndefined();
		expect(entry.stdout).toBeUndefined();
		expect(entry.completedAt).toBeUndefined();
	});

	it('records a relaunch with its feedback truncated to 2000 characters', () => {
		const entry = startStepEntry(
			{ status: 'completed', attempts: 1, relaunches: [{ at: 'x', feedback: 'first' }] } as StepState,
			{ resumed: false, reRunKind: 'loop', relaunchFeedback: 'f'.repeat(3000) }
		);

		expect(entry.relaunches).toHaveLength(2);
		expect(entry.relaunches![1].feedback).toHaveLength(2000);
		expect(entry.runningAttempt).toEqual({ origin: 'relaunch', relaunchIndex: 1 });
	});

	it('marks a resumed start as a resume', () => {
		const entry = startStepEntry({ status: 'pending', attempts: 1 } as StepState, {
			resumed: true,
			reRunKind: 'loop',
		});

		expect(entry.runningAttempt).toEqual({ origin: 'resume' });
	});
});

describe('failRunningSteps', () => {
	it('fails only running steps, masks the abandoned attempt error and does not change the input', () => {
		const state = {
			executionId: 'abcd1234',
			steps: {
				a: {
					status: 'running',
					startedAt: '2026-01-01T00:00:00.000Z',
					runningAttempt: { origin: 'first' },
					attempts: 1,
				},
				b: { status: 'completed' },
				c: { status: 'pending' },
			},
		} as unknown as ExecutionState;

		const steps = failRunningSteps(state, 'token=SECRET', text => text.replace('SECRET', '***'));

		expect(steps.a).toMatchObject({ status: 'failed', error: 'token=SECRET' });
		expect(steps.b.status).toBe('completed');
		expect(steps.c.status).toBe('pending');
		expect(state.steps.a.status).toBe('running');
		expect(JSON.stringify(steps.a.attemptLog)).toContain('token=***');
		expect(JSON.stringify(steps.a.attemptLog)).not.toContain('SECRET');
	});
});

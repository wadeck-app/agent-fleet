// Integration test: exercises the real Daemon.ts 'resume' command route and the real
// ExecutionStore/CommandHandler wiring (no mocks), unlike CommandHandler.test.ts's unit
// coverage of the resumability logic itself. Does not require a built worker binary: both
// cases here are rejected before any step would ever be dispatched.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { startTestDaemon } from '../test-utils/TestHelpers';

const SIMPLE_SCRIPT_FLOW = `\
id: resume-e2e
version: "1.0.0"
name: Resume E2E
description: Single script step, never fails on an intervention
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

describe('resume command (real daemon)', () => {
	it('returns EXECUTION_NOT_FOUND for an executionId the daemon has never seen', async () => {
		await using ctx = await startTestDaemon();

		// Must match ExecutionStore's expected id shape (8 lowercase alnum chars, same as
		// generateExecutionId()'s output) -- an arbitrary string hits a format check deeper
		// in ExecutionStore, which is a separate concern from this test.
		const response = await ctx.client.send('resume', { type: 'resume', executionId: 'ffffffff' });

		expect(response.type).toBe('error');
		if (response.type !== 'error') throw new Error('Expected error response');
		expect(response.code).toBe('EXECUTION_NOT_FOUND');
	});

	it('returns NOT_RESUMABLE for an execution that exists but did not fail on an unanswered intervention', async () => {
		const flowYml = path.join(os.tmpdir(), `resume-e2e-flow-${Date.now()}.yml`);
		fs.writeFileSync(flowYml, SIMPLE_SCRIPT_FLOW, 'utf8');

		try {
			await using ctx = await startTestDaemon();

			const runResponse = await ctx.client.send('run', {
				type: 'run',
				flowFile: flowYml,
				cwd: os.tmpdir(),
				inputs: {},
			});
			expect(runResponse.type).toBe('execution_started');
			if (runResponse.type !== 'execution_started') throw new Error('Expected execution_started');

			const resumeResponse = await ctx.client.send('resume', {
				type: 'resume',
				executionId: runResponse.executionId,
			});

			expect(resumeResponse.type).toBe('error');
			if (resumeResponse.type !== 'error') throw new Error('Expected error response');
			expect(resumeResponse.code).toBe('NOT_RESUMABLE');
		} finally {
			fs.rmSync(flowYml, { force: true });
		}
	}, 15000);
});

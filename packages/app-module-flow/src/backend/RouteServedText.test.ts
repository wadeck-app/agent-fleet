import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerExecutionLogRoutes } from './ExecutionLogRoutes.js';
import { registerExecutionRoutes } from './ExecutionRoutes.js';
import { registerLogRoutes } from './LogRoutes.js';

// The routes serve free text from a run with ANSI stripped and NOTHING else: no secret guessing, no counters. What is
// served is what is stored (secrets are masked by exact value when the daemon writes). One test per endpoint that
// carries such text.

const ESC = '\u001b';
// Looks like a credential on purpose: it must come out exactly as it went in.
const LOOKS_SECRET = 'PASSWORD=left-as-stored';

let fixture: FlowConfigFixture;
let routes: ReturnType<typeof collectRoutes>['routes'];

beforeEach(() => {
	fixture = new FlowConfigFixture();
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	const service = FlowQueryService.forConfigDir(fixture.configDir);
	registerExecutionRoutes(collected.ctx, service);
	registerExecutionLogRoutes(collected.ctx, service);
	registerLogRoutes(collected.ctx, service);
});

afterEach(() => fixture.dispose());

function addFailedRun(): void {
	fixture.addExecution({
		executionId: 'run1',
		flowId: 'build',
		status: 'failed',
		startedAt: '2026-08-16T10:00:00.000Z',
		completedAt: '2026-08-16T10:05:00.000Z',
		lastError: `${ESC}[31mpush failed${ESC}[0m`,
		steps: {
			test: {
				status: 'failed',
				error: `${ESC}[31mexit 1${ESC}[0m`,
				stdout: `${ESC}[36mrunning${ESC}[0m\n${LOOKS_SECRET}\n10%\r100%`,
				stderr: `${ESC}[33mwarn${ESC}[0m`,
				relaunches: [{ at: '2026-08-16T10:02:00.000Z', feedback: `${ESC}[32mretry${ESC}[0m` }],
			},
		},
	});
}

describe('GET /executions/:id', () => {
	it('serves the rendered text and the step fields without ANSI, and as stored otherwise', async () => {
		addFailedRun();
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'run1' }, query: {} });

		expect(JSON.stringify(body)).not.toContain(ESC);
		expect((body as { text: string }).text).toContain('100%');
		expect((body as { text: string }).text).toContain(LOOKS_SECRET);
		expect((body as { steps: { error: string }[] }).steps[0]!.error).toBe('exit 1');
	});

	it('carries no redaction field', async () => {
		addFailedRun();
		const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: 'run1' }, query: {} });

		for (const key of ['redactions', 'hasRedactions', 'redactionsLabel']) {
			expect(body).not.toHaveProperty(key);
		}
	});

	it('strips ANSI before the tail is cut, so the cut cannot leave half an escape sequence', async () => {
		fixture.addExecution({
			executionId: 'cut1',
			status: 'failed',
			steps: { s: { status: 'failed', stdout: `${`${ESC}[36mline${ESC}[0m\n`.repeat(100)}end` } },
		});
		const { body } = await callRoute(routes, 'GET /executions/:id', {
			params: { id: 'cut1' },
			query: { tail: '60' },
		});

		expect((body as { text: string }).text).not.toContain(ESC);
	});
});

describe('GET /executions', () => {
	it('serves the last error of each row without ANSI', async () => {
		addFailedRun();
		const { body } = await callRoute(routes, 'GET /executions', { query: {} });
		const served = body as { items: { lastError: string }[] };

		expect(served.items[0]!.lastError).toBe('push failed');
		expect(body).not.toHaveProperty('redactions');
	});
});

describe('GET /executions/:id/logs', () => {
	it('serves messages and the recorded output without ANSI, and as stored otherwise', async () => {
		addFailedRun();
		fixture.addLog('2026-08-16', [
			JSON.stringify({
				prefix: '[run1|test]',
				timestamp: '2026-08-16T10:01:00.000Z',
				level: 'info',
				message: `${ESC}[32m${LOOKS_SECRET}${ESC}[0m`,
			}),
		]);
		const { body } = await callRoute(routes, 'GET /executions/:id/logs', { params: { id: 'run1' }, query: {} });
		const logs = body as { entries: { message: string }[]; recordedOutput: string };

		expect(logs.entries[0]!.message).toBe(LOOKS_SECRET);
		expect(JSON.stringify(body)).not.toContain(ESC);
		expect(logs.recordedOutput).toContain(LOOKS_SECRET);
		expect(body).not.toHaveProperty('redactions');
	});

	it('keeps hasRecordedOutput true for a recorded output that looks like a credential', async () => {
		fixture.addExecution({
			executionId: 'run2',
			status: 'failed',
			steps: { s: { status: 'failed', stdout: 'PASSWORD=abc' } },
		});
		const { body } = await callRoute(routes, 'GET /executions/:id/logs', { params: { id: 'run2' }, query: {} });

		expect(body).toMatchObject({ hasRecordedOutput: true });
	});
});

describe('GET /logs', () => {
	it('serves the lines of the day without ANSI, and as stored otherwise', async () => {
		fixture.addLog('2026-08-16', [
			JSON.stringify({ ts: '2026-08-16T12:34:56.789Z', level: 'info', msg: `${ESC}[1m${LOOKS_SECRET}${ESC}[0m` }),
		]);
		const { body } = await callRoute(routes, 'GET /logs', { query: { date: '2026-08-16' } });
		const log = body as { text: string };

		expect(log.text).toContain(LOOKS_SECRET);
		expect(log.text).not.toContain(ESC);
		expect(body).not.toHaveProperty('redactions');
	});
});

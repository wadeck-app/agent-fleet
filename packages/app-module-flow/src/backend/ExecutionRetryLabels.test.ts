import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService, NO_RETRY_LEFT } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerExecutionRoutes } from './ExecutionRoutes.js';

// The retry cell of the steps table, decided from the recorded attempts and the retry policy of the flow file.
const FLOW_YAML = [
	'id: deploy',
	'name: Deploy',
	'steps:',
	'  - { id: plain, type: script, script: ok }',
	'  - { id: retried, type: script, script: ok, retry: { maxAttempts: 2, backoff: linear } }',
	'  - { id: looped, type: script, script: ok, onFailure: { goto: plain, maxIterations: 1 } }',
	'',
].join('\n');

let fixture: FlowConfigFixture;
let routes: ReturnType<typeof collectRoutes>['routes'];

beforeEach(() => {
	fixture = new FlowConfigFixture();
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	registerExecutionRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir));
});

afterEach(() => fixture.dispose());

function addRun(executionId: string, steps: Record<string, object>, withFlowFile: boolean): void {
	const flowFile = join(fixture.configDir, `${executionId}.yml`);
	if (withFlowFile) writeFileSync(flowFile, FLOW_YAML);
	fixture.addExecution({ executionId, flowFile, steps: steps as never });
}

async function labelsOf(executionId: string): Promise<string[]> {
	const { body } = await callRoute(routes, 'GET /executions/:id', { params: { id: executionId }, query: {} });
	return (body as { steps: { retryLabel: string }[] }).steps.map(step => step.retryLabel);
}

describe('GET /executions/:id retryLabel', () => {
	it('counts the retries of each step as attempts - 1, 0 included, and a dash for a step that did not start', async () => {
		addRun(
			'rt1',
			{
				plain: { status: 'completed', attempts: 1 },
				retried: { status: 'completed', attempts: 3 },
				looped: { status: 'pending' },
			},
			true
		);
		expect(await labelsOf('rt1')).toEqual(['0 retry', '2 retries', '-']);
	});

	it('says no retry left for a failed step without retry, or whose retry and loop budget is spent', async () => {
		addRun(
			'rt2',
			{
				plain: { status: 'failed', attempts: 1, error: 'boom' },
				retried: { status: 'failed', attempts: 3, error: 'boom' },
				looped: { status: 'failed', attempts: 2, error: 'boom' },
			},
			true
		);
		expect(await labelsOf('rt2')).toEqual([NO_RETRY_LEFT, NO_RETRY_LEFT, NO_RETRY_LEFT]);
	});

	it('keeps the count for a failed step that still had budget', async () => {
		addRun('rt3', { retried: { status: 'failed', attempts: 2, error: 'boom' } }, true);
		expect(await labelsOf('rt3')).toEqual(['1 retry']);
	});

	it('does not claim exhaustion when the flow file is gone: the policy is unknown', async () => {
		addRun(
			'rt4',
			{ plain: { status: 'failed', attempts: 4, error: 'boom' }, other: { status: 'completed', attempts: 2 } },
			false
		);
		expect(await labelsOf('rt4')).toEqual(['retry policy unknown', '1 retry']);
	});

	it('does not claim exhaustion for a step the flow file does not declare (injected at run time)', async () => {
		addRun('rt6', { injected: { status: 'failed', attempts: 2, error: 'boom' } }, true);
		expect(await labelsOf('rt6')).toEqual(['retry policy unknown']);
	});

	it('says the retries are unknown for a record written before attempts existed', async () => {
		addRun('rt5', { plain: { status: 'completed' } }, true);
		expect(await labelsOf('rt5')).toEqual(['retries unknown']);
	});

	it('says the policy is unknown when the flow file is not a flow, the cell being the visible signal', async () => {
		const flowFile = join(fixture.configDir, 'rt7.yml');
		writeFileSync(flowFile, 'just: a mapping');
		fixture.addExecution({
			executionId: 'rt7',
			flowFile,
			steps: { plain: { status: 'failed', attempts: 1 } } as never,
		});
		expect(await labelsOf('rt7')).toEqual(['retry policy unknown']);
	});
});

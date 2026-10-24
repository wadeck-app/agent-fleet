import Ajv from 'ajv';
import { FLOW_EVENT_CATALOG } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { ExecutionStore } from '../storage/ExecutionStore';
import { RecordingFlowEventPublisher } from '../test-utils/RecordingFlowEventPublisher';
import { FlowEventMapper } from './FlowEventMapper';
import { FLOW_EVENT_NAMES } from './FlowEventPublisher';

const EXEC_ID = 'abcd1234';

describe('flow event catalog vs what the mapper publishes', () => {
	let dir: string;
	let publisher: RecordingFlowEventPublisher;
	let store: ExecutionStore;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-catalog-'));
		publisher = new RecordingFlowEventPublisher();
		const mapper = new FlowEventMapper(publisher, err => {
			throw err;
		});
		store = new ExecutionStore(dir, 30, new ExecutionMasks(), mapper);
		store.create({
			executionId: EXEC_ID,
			flowFile: 'f.yml',
			flowId: 'my-flow',
			stepIds: ['a', 'b'],
			projectRoot: '/work/project',
		});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('declares exactly the event names the publisher can emit', () => {
		expect(FLOW_EVENT_CATALOG.map(event => event.name)).toEqual([...FLOW_EVENT_NAMES]);
	});

	it('accepts the payload of every transition, retries and long errors included', () => {
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepFailed(EXEC_ID, 'a', `first line ${'x'.repeat(400)}\nsecond line`);
		store.markStepRunning(EXEC_ID, 'a');
		store.markStepCompleted(EXEC_ID, 'a');
		store.markExecutionCompleted(EXEC_ID);
		store.markStepRunning(EXEC_ID, 'b');
		store.markStepFailed(EXEC_ID, 'b', 'boom');
		store.markExecutionFailed(EXEC_ID);

		const ajv = new Ajv();
		const seen = new Set<string>();
		for (const { event, payload } of publisher.events) {
			const definition = FLOW_EVENT_CATALOG.find(candidate => candidate.name === event);
			expect(definition, `${event} is not in the catalog`).toBeDefined();
			const validate = ajv.compile(definition!.schema);
			expect(
				validate(payload),
				`${event}: ${JSON.stringify(validate.errors)} for ${JSON.stringify(payload)}`
			).toBe(true);
			seen.add(event);
		}
		// The scenario must exercise every event, or the check above proves nothing for the missing one.
		expect([...seen].sort()).toEqual([...FLOW_EVENT_NAMES].sort());
	});
});

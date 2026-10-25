import Ajv from 'ajv';

import { EventsDocumentation } from './EventsDocumentation';
import { FLOW_EVENT_CATALOG, FLOW_EVENT_SOURCE } from './FlowEventCatalog';

// Limits the queue daemon enforces on a declaration (queue-sdk docs, "Declaring your events").
const MAX_EVENTS = 500;
const MAX_NAME_CHARS = 128;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_SCHEMA_BYTES = 64 * 1024;
const MAX_EXAMPLE_BYTES = 16 * 1024;

describe('FLOW_EVENT_CATALOG', () => {
	it('declares the six lifecycle events under the "flow" source, names unique', () => {
		expect(FLOW_EVENT_SOURCE).toBe('flow');
		const names = FLOW_EVENT_CATALOG.map(event => event.name);
		expect(names).toEqual([
			'flow.execution.started',
			'flow.execution.completed',
			'flow.execution.failed',
			'flow.step.started',
			'flow.step.completed',
			'flow.step.failed',
		]);
		expect(new Set(names).size).toBe(names.length);
		expect(FLOW_EVENT_CATALOG.length).toBeLessThanOrEqual(MAX_EVENTS);
	});

	describe.each(FLOW_EVENT_CATALOG.map(event => [event.name, event] as const))('%s', (_name, event) => {
		it('respects the queue limits', () => {
			expect(event.name).toMatch(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/);
			expect(event.name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
			expect(event.description.trim()).not.toBe('');
			expect(event.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
			expect(JSON.stringify(event.schema).length).toBeLessThanOrEqual(MAX_SCHEMA_BYTES);
			expect(JSON.stringify(event.example).length).toBeLessThanOrEqual(MAX_EXAMPLE_BYTES);
		});

		it('is ASCII only', () => {
			// eslint-disable-next-line no-control-regex
			expect(JSON.stringify(event)).toMatch(/^[\x00-\x7F]*$/);
		});

		it('has an example its own schema accepts', () => {
			const validate = new Ajv().compile(event.schema);
			expect(validate(event.example), JSON.stringify(validate.errors)).toBe(true);
		});

		it('is correlated by the execution, and by the step for step events', () => {
			const expected = event.name.startsWith('flow.step.')
				? ['payload.executionId', 'payload.stepId']
				: ['payload.executionId'];
			expect(event.correlationKey).toEqual(expected);
		});
	});

	it('marks the execution endings as terminal, with their outcome', () => {
		const byName = Object.fromEntries(FLOW_EVENT_CATALOG.map(event => [event.name, event]));
		expect(byName['flow.execution.completed']).toMatchObject({ terminal: true, outcome: 'success' });
		expect(byName['flow.execution.failed']).toMatchObject({ terminal: true, outcome: 'failure' });
		// A failed step can be retried, so only a completed step is final.
		expect(byName['flow.step.completed']).toMatchObject({ terminal: true, outcome: 'success' });
		expect(byName['flow.step.failed']).toMatchObject({ terminal: false, outcome: 'failure' });
		expect(byName['flow.execution.started']).toMatchObject({ terminal: false });
		expect(byName['flow.step.started']).toMatchObject({ terminal: false });
	});

	it('tells in the descriptions about retries, skipped steps, resume and user_intervention', () => {
		const text = (name: string): string => FLOW_EVENT_CATALOG.find(event => event.name === name)!.description;
		expect(text('flow.step.started')).toContain('attempt + 1');
		expect(text('flow.step.completed')).toContain('skipped');
		expect(text('flow.execution.started')).toContain('flow resume');
		expect(text('flow.execution.failed')).toContain('user_intervention');
	});
});

describe('EventsDocumentation vs the catalog', () => {
	const docs = new EventsDocumentation().generate();

	it('lists every event with its description and whether it is terminal', () => {
		for (const event of FLOW_EVENT_CATALOG) {
			const row = docs.split('\n').find(line => line.startsWith(`| \`${event.name}\` |`));
			expect(row, `no docs row for ${event.name}`).toBeDefined();
			expect(row).toContain(event.description);
			expect(row).toContain(event.terminal ? `yes (${event.outcome})` : 'no');
		}
	});

	it('lists every payload field of every schema with its description', () => {
		for (const event of FLOW_EVENT_CATALOG) {
			const properties = event.schema['properties'] as Record<string, { description: string }>;
			for (const [field, property] of Object.entries(properties)) {
				expect(docs, `${field} of ${event.name}`).toContain(`| \`${field}\` |`);
				expect(docs).toContain(property.description);
			}
		}
	});
});

describe('FLOW_EVENT_CATALOG projectId', () => {
	it.each(FLOW_EVENT_CATALOG.map(event => [event.name, event] as const))(
		'%s declares an optional string projectId next to projectRoot, and shows it in its example',
		(_name, event) => {
			const schema = event.schema as { properties: Record<string, { type?: string }>; required: string[] };
			expect(schema.properties['projectId']?.type).toBe('string');
			expect(schema.required).not.toContain('projectId');
			expect(event.example).toHaveProperty('projectId');
		}
	);
});

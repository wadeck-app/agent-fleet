import { FLOW_EVENT_CATALOG, type FlowEventDefinition } from './FlowEventCatalog';

/** Markdown section about the lifecycle events the flow daemon publishes to the queue, embedded in the generated flow documentation. */
export class EventsDocumentation {
	public generate(): string {
		return [
			'## Section 9: Events',
			'',
			'The flow daemon publishes lifecycle events to the queue and declares them to it at start (`queue events list`, `queue events show <name>`). Wait on them with `queue wait` instead of polling `flow status`.',
			'',
			'| Event | Fires when | Ends what it is about |',
			'| --- | --- | --- |',
			...FLOW_EVENT_CATALOG.map(event => this.eventRow(event)),
			'',
			'### Payload',
			'',
			'| Field | Content | Events |',
			'| --- | --- | --- |',
			...this.payloadRows(),
			'',
			'No inputs, environment values, tokens, step outputs, stdout or stderr are ever published.',
			'',
			'### Wait for an execution',
			'',
			'`queue wait` matches exact event names (no wildcards; wildcards exist only in `subscribers.yml`). Several `--when` must all hold. To wait for completed OR failed, run two waits.',
			'',
			'```',
			'queue wait flow.execution.completed --when "payload.executionId=<id>" --since 5m --json',
			'queue wait flow.execution.failed --when "payload.executionId=<id>" --since 5m --json',
			'queue wait flow.step.failed --when "payload.executionId=<id>" --when "payload.stepId=<step>" --json',
			'```',
			'',
			'### Notes',
			'',
			'- Needs the `queue` CLI on the PATH of the flow daemon; the queue daemon is started on demand if stopped. The daemon log (`flow logs`) states at start whether events are enabled or unavailable, and whether the queue accepted the event declaration.',
			'- `FLOW_QUEUE_EVENTS=0` in the flow daemon environment switches events off (nothing is published or declared).',
			'- Delivery is best effort: a failure to publish never affects a run.',
			'- In `subscribers.yml`, `flow.>` matches all flow events and `flow.step.*` all step events (`flow.*` matches nothing).',
		].join('\n');
	}

	private eventRow(event: FlowEventDefinition): string {
		const ends = event.terminal ? `yes (${event.outcome})` : 'no';
		return `| \`${event.name}\` | ${event.description} | ${ends} |`;
	}

	/** One row per payload field of any event, in order of first appearance, saying which events carry it. */
	private payloadRows(): string[] {
		const fields = new Map<string, { description: string; events: string[] }>();
		for (const event of FLOW_EVENT_CATALOG) {
			const properties = event.schema['properties'] as Record<string, { description: string }>;
			for (const [field, property] of Object.entries(properties)) {
				const known = fields.get(field) ?? { description: property.description, events: [] };
				known.events.push(event.name);
				fields.set(field, known);
			}
		}
		return [...fields].map(([field, { description, events }]) => {
			const carriers =
				events.length === FLOW_EVENT_CATALOG.length ? 'all' : events.map(name => `\`${name}\``).join(', ');
			return `| \`${field}\` | ${description} | ${carriers} |`;
		});
	}
}

import { describe, expect, it } from 'vitest';

import { HostToolModelView } from './HostToolModelView';
import type { HostTool } from './HostToolTypes';

const SHOW: HostTool = {
	id: 'queue-task-show',
	description: 'Show a task of the queue by id (read only).',
	sideEffect: 'read',
	command: ['canary-binary', 'show', '{id}', '--status={status}', '--json'],
	args: {
		id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', required: true, description: 'Task id' },
		status: { type: 'enum', values: ['open', 'done'] },
		limit: { type: 'integer', min: 1, max: 50 },
		verbose: { type: 'boolean' },
	},
	env: ['CANARY_ENV_NAME'],
};

describe('HostToolModelView.describe', () => {
	it('names the tool by its id and appends side effect, location and arguments to the description', () => {
		const view = HostToolModelView.describe(SHOW);
		expect(view.name).toBe('queue-task-show');
		expect(view.description).toBe(
			'Show a task of the queue by id (read only). (side effect: read; runs on the host; arguments: id (string, required), status (enum: open|done), limit (integer 1..50), verbose (boolean))'
		);
	});

	it('says there are no arguments when the tool declares none', () => {
		const view = HostToolModelView.describe({ ...SHOW, args: undefined });
		expect(view.description).toContain('arguments: none');
		expect(view.inputSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false });
	});

	it('builds a closed input schema with the declared types and bounds', () => {
		expect(HostToolModelView.describe(SHOW).inputSchema).toEqual({
			type: 'object',
			properties: {
				id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', description: 'Task id' },
				status: { type: 'string', enum: ['open', 'done'] },
				limit: { type: 'integer', minimum: 1, maximum: 50 },
				verbose: { type: 'boolean' },
			},
			required: ['id'],
			additionalProperties: false,
		});
	});

	it('does not carry the command, the environment names or the working directory', () => {
		const text = JSON.stringify(HostToolModelView.describe(SHOW));
		expect(text).not.toContain('canary-binary');
		expect(text).not.toContain('--json');
		expect(text).not.toContain('CANARY_ENV_NAME');
	});
});

describe('HostToolModelView.serialize', () => {
	it('serializes the set as JSON in declaration order, without the command', () => {
		const other: HostTool = { ...SHOW, id: 'queue-task-list', args: undefined };
		const text = HostToolModelView.serialize([SHOW, other]);
		const parsed = JSON.parse(text) as { name: string }[];
		expect(parsed.map(entry => entry.name)).toEqual(['queue-task-show', 'queue-task-list']);
		expect(text).not.toContain('canary-binary');
	});

	it('measures the size in bytes, not characters', () => {
		const tool: HostTool = { ...SHOW, description: '€€€€' };
		const text = HostToolModelView.serialize([tool]);
		expect(HostToolModelView.byteLength([tool])).toBe(Buffer.byteLength(text, 'utf8'));
		expect(HostToolModelView.byteLength([tool])).toBeGreaterThan(text.length);
	});
});

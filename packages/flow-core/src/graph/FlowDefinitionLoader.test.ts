import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FlowDefinitionError, loadFlowDefinition } from './FlowDefinitionLoader.js';

describe('loadFlowDefinition', () => {
	let dir: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-core-definition-'));
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	const write = (name: string, content: string): string => {
		const file = path.join(dir, name);
		fs.writeFileSync(file, content);
		return file;
	};

	const kindOf = (file: string): unknown => {
		try {
			loadFlowDefinition(file);
		} catch (err) {
			expect(err).toBeInstanceOf(FlowDefinitionError);
			return (err as FlowDefinitionError).kind;
		}
		throw new Error('expected loadFlowDefinition to throw');
	};

	it('parses a flow file', () => {
		const file = write(
			'ok.yml',
			"id: factory_triage\nversion: '1.0.0'\nname: Triage\nsteps:\n  - id: announce\n    name: Announce\n    type: script\n    script: echo\n"
		);

		const flow = loadFlowDefinition(file);

		expect(flow.id).toBe('factory_triage');
		expect(flow.steps.map(s => s.id)).toEqual(['announce']);
	});

	it('reports a missing file with the reason temporary flows disappear', () => {
		const file = path.join(dir, 'gone.yml');

		expect(kindOf(file)).toBe('flow-file-missing');
		expect(() => loadFlowDefinition(file)).toThrow(/Flow file not found: .*gone\.yml.*\.flow\/\.tmp/);
	});

	it('reports a YAML syntax error as unreadable, with the next action', () => {
		const file = write('broken.yml', 'id: [unclosed\nsteps: {');

		expect(kindOf(file)).toBe('flow-file-unreadable');
		expect(() => loadFlowDefinition(file)).toThrow(/Cannot read flow file[\s\S]*flow validate/);
	});

	it('reports a file that is not a flow definition', () => {
		expect(kindOf(write('list.yml', '- a\n- b\n'))).toBe('flow-file-invalid');
		expect(kindOf(write('nosteps.yml', 'id: x\nname: y\n'))).toBe('flow-file-invalid');
		expect(kindOf(write('noid.yml', 'steps: []\n'))).toBe('flow-file-invalid');
		expect(kindOf(write('empty.yml', ''))).toBe('flow-file-invalid');
	});
});

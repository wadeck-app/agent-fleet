import type { FlowDefinitionResolver, ResolvedDefinition } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogWriter } from '../storage/LogWriter.js';
import { RunDefinitionLoader } from './RunDefinitionLoader.js';

/**
 * `flow run <file>` parses the YAML with js-yaml and runs the parsed object as is (no FlowRegistry):
 * these tests pin that every model/script/sub-step field written in the file reaches the definition that runs.
 */
describe('RunDefinitionLoader keeps every step field of the flow file', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-def-fields-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('hands the parsed step fields unchanged to the resolver', () => {
		const flowFile = path.join(dir, 'flow.yml');
		fs.writeFileSync(
			flowFile,
			[
				'id: fields',
				'name: Fields',
				'version: 1.0.0',
				'workspace: { mode: shared, gitStrategy: main-only, reusePolicy: never }',
				'steps:',
				'  - id: m',
				'    name: M',
				'    type: model',
				'    model: haiku',
				'    prompt: hi',
				'    contextLimit: 60000',
				'    subStepFeedbackPrompt: "Fix: ${{ subStepFeedback }}"',
				'    tools: [read]',
				'    skipPermissions: true',
				'    onCompact: { command: echo done, timeout: 5 }',
				'    permission: { external_directory: allow }',
				'    labels: [gpu]',
				'    subStepStrategy: waves',
				'    maxSubStepIterations: 5',
				'  - id: s',
				'    name: S',
				'    type: script',
				'    script: "true"',
				'    parent: m',
				'    wave: 1',
				'',
			].join('\n')
		);
		let received: Record<string, unknown> | undefined;
		const resolver = {
			forFile: (request: { flow: unknown }): ResolvedDefinition => {
				received = request.flow as Record<string, unknown>;
				return { flow: request.flow } as unknown as ResolvedDefinition;
			},
		} as unknown as FlowDefinitionResolver;
		const loader = new RunDefinitionLoader(resolver, { writeExecution: () => undefined } as unknown as LogWriter);

		const loaded = loader.load({ type: 'run', flowFile } as never, flowFile);

		expect(loaded.ok ? 'ok' : JSON.stringify(loaded.response)).toBe('ok');
		const steps = received!.steps as Array<Record<string, unknown>>;
		expect(steps[0]).toMatchObject({
			contextLimit: 60000,
			subStepFeedbackPrompt: 'Fix: ${{ subStepFeedback }}',
			tools: ['read'],
			skipPermissions: true,
			onCompact: { command: 'echo done', timeout: 5 },
			permission: { external_directory: 'allow' },
			labels: ['gpu'],
			subStepStrategy: 'waves',
			maxSubStepIterations: 5,
		});
		expect(steps[1]).toMatchObject({ parent: 'm', wave: 1 });
	});
});

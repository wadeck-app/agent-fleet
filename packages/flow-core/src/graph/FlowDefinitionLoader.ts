import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';

import { FlowCoreError, errorMessage } from '../errors.js';

export type FlowDefinitionErrorKind = 'flow-file-missing' | 'flow-file-unreadable' | 'flow-file-invalid';

/** The flow file behind a graph request could not be turned into a definition; the message says what to do. */
export class FlowDefinitionError extends FlowCoreError {
	constructor(
		message: string,
		override readonly kind: FlowDefinitionErrorKind
	) {
		super(message, kind);
	}
}

/**
 * Reads and parses a flow file (JSON_SCHEMA, like `flow show`, so dates and other YAML types are not coerced)
 * and checks the bare minimum a graph needs: an object with an `id` and a `steps` array.
 * Full validation stays with `flow validate`.
 */
export function loadFlowDefinition(flowFile: string): FlowDefinition {
	if (!fs.existsSync(flowFile)) {
		throw new FlowDefinitionError(
			`Flow file not found: ${flowFile}. Flows generated for a single run (.flow/.tmp) are deleted afterwards; ` +
				'the graph is only available while the file exists.',
			'flow-file-missing'
		);
	}
	return parseFlowDefinition(fs.readFileSync(flowFile, 'utf8'), flowFile);
}

/** Parses the text of a flow (a file or a recorded snapshot) with the checks of {@link loadFlowDefinition}; `label` names it in errors. */
export function parseFlowDefinition(text: string, label: string): FlowDefinition {
	let raw: unknown;
	try {
		raw = yaml.load(text, { schema: yaml.JSON_SCHEMA });
	} catch (err) {
		throw new FlowDefinitionError(
			`Cannot read flow file ${label}: ${errorMessage(err)}. Fix the file (check it with \`flow validate\`).`,
			'flow-file-unreadable'
		);
	}
	const flow = raw as Partial<FlowDefinition> | null;
	if (!flow || typeof flow !== 'object' || Array.isArray(flow) || !Array.isArray(flow.steps) || !flow.id) {
		throw new FlowDefinitionError(
			`Flow file ${label} is not a flow definition (expected an object with 'id' and a 'steps' list). ` +
				'Check it with `flow validate`.',
			'flow-file-invalid'
		);
	}
	return flow as FlowDefinition;
}

import { createRequire } from 'node:module';
import { InjectedStepGuard } from 'flow-engine';
import { describe, expect, it } from 'vitest';

interface JsonSchema {
	type?: string;
	enum?: string[];
	properties?: Record<string, JsonSchema>;
	additionalProperties?: unknown;
	items?: JsonSchema;
}

// mcp-server.cjs is a standalone script (it cannot import the TS packages), so the advertised schema is checked here
// against the daemon's InjectedStepGuard to make drift fail a test instead of confusing a model.
const require = createRequire(import.meta.url);
// The file serves stdin when loaded, whoever loads it (the sandbox forwarder uses require()); this asks for the definition only.
process.env['FLOW_MCP_SERVER_DEFINITION_ONLY'] = '1';
const { PROVIDE_STEPS_TOOL } = require('./mcp-server.cjs') as { PROVIDE_STEPS_TOOL: { inputSchema: JsonSchema } };

const inputSchema = PROVIDE_STEPS_TOOL.inputSchema;

function stepItemSchema(): JsonSchema {
	const items = inputSchema.properties?.['steps']?.items;
	if (items === undefined) {
		throw new Error('provideSteps schema has no steps.items');
	}
	return items;
}

describe('provideSteps advertised schema matches InjectedStepGuard', () => {
	it('advertises exactly the allowed keys', () => {
		const advertised = Object.keys(stepItemSchema().properties ?? {}).sort();
		expect(advertised).toEqual([...InjectedStepGuard.ALLOWED_KEYS].sort());
	});

	it('does not advertise the keys that are only accepted as false', () => {
		const advertised = Object.keys(stepItemSchema().properties ?? {});
		expect(advertised).not.toContain('skipPermissions');
		expect(advertised).not.toContain('host');
	});

	it('refuses extra keys on a step', () => {
		expect(stepItemSchema().additionalProperties).toBe(false);
	});

	it('advertises exactly the allowed types', () => {
		expect(stepItemSchema().properties?.['type']?.enum).toEqual([...InjectedStepGuard.ALLOWED_TYPES]);
	});

	// Nested steps are plain objects here (no $ref, which some MCP clients do not resolve); the daemon walks them with the same guard.
	it.each(['steps', 'subSteps'])('nested %s is an array of objects without a $ref', key => {
		const nested = stepItemSchema().properties?.[key];
		expect(nested?.type).toBe('array');
		expect(nested?.items).toEqual({ type: 'object' });
	});
});

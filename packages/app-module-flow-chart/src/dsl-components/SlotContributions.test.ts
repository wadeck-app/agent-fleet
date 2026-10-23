import { FLOW_ACTION_SLOT_ACCEPTS, FLOW_APP_MODULE_ID, FLOW_EXPOSED_SLOTS } from 'flow-core';
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FLOW_CHART_LINK_KEYS } from './FlowChartLinkProps.js';

// What this module contributes to the slots of the flow module, checked against the contract that module publishes
// through flow-core (never against its files): the root $type each slot accepts, and no key that could restyle it.
const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8')) as {
	extensionPoints: { kind: string; slot: string; view: { value: string } }[];
};
const flowSlotPrefix = `${FLOW_APP_MODULE_ID}:`;
const contributions = manifest.extensionPoints
	.filter(point => point.slot.startsWith(flowSlotPrefix) && point.slot !== `${flowSlotPrefix}nav`)
	.map(point => {
		const view = load(readFileSync(join(packageDir, point.view.value), 'utf8')) as Record<string, unknown>;
		return { slot: point.slot.slice(flowSlotPrefix.length), file: point.view.value, view };
	});

describe('contributions to the slots of the flow module', () => {
	it('fills every slot the flow module exposes (an unfilled one would leave the button out of a page)', () => {
		expect(contributions.map(c => c.slot).sort()).toEqual(Object.keys(FLOW_EXPOSED_SLOTS).sort());
	});

	it.each(contributions)('$file has a root $type the slot accepts, read from the flow contract', ({ slot, view }) => {
		expect(FLOW_EXPOSED_SLOTS[slot], slot).toContain(view['$type']);
		expect(FLOW_ACTION_SLOT_ACCEPTS).toContain(view['$type']);
	});

	it.each(contributions)('$file carries no key outside the component contract (no style prop)', ({ view }) => {
		const allowed = ['$type', ...FLOW_CHART_LINK_KEYS];
		expect(Object.keys(view).filter(key => !allowed.includes(key))).toEqual([]);
	});
});

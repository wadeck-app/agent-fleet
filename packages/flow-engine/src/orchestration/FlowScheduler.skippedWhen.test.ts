/**
 * FlowScheduler -- a `when:` skip must settle the whole graph: sub-steps of a skipped parent, dependents
 * of skipped steps, and conditions on steps that are not declared dependencies. Reproduces the
 * "when-probe" flow: execution stuck `running` right after step `a` completed.
 */
import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { ReadyItem, SchedulerStep } from './FlowScheduler';

function step(id: string, extra?: Partial<SchedulerStep>): SchedulerStep {
	return { id, ...extra };
}

/** Same implicit parent dependency as FlowOrchestrator: a sub-step depends on its parent. */
function start(scheduler: FlowScheduler, steps: SchedulerStep[]): ReadyItem[] {
	const depends = new Map<string, string[]>(
		steps.map(s => {
			const explicit = s.depends ?? [];
			return [s.id, s.parent && !explicit.includes(s.parent) ? [...explicit, s.parent] : explicit];
		})
	);
	return scheduler.start(steps, depends);
}

function ids(items: ReadyItem[]): string[] {
	return items.map(item => item.stepId).sort();
}

/** Runs every ready step to success with the given outputs; returns the order in which steps ran. */
function drain(scheduler: FlowScheduler, first: ReadyItem[], outputsOf: Record<string, Record<string, unknown>>) {
	const ran: string[] = [];
	const queue = [...first];
	while (queue.length > 0) {
		const item = queue.shift()!;
		ran.push(item.stepId);
		scheduler.acknowledge(item.stepId);
		queue.push(...scheduler.complete(item.stepId, { type: 'completed', outputs: outputsOf[item.stepId] ?? {} }));
	}
	return ran;
}

const NOT_DEV = "steps.a.outputs.go == 'dev'";

describe('FlowScheduler -- when-probe shape', () => {
	it('skips p, s, d, runs e then f, and ends terminal', () => {
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		const first = start(scheduler, [
			step('a'),
			step('p', { depends: ['a'], when: NOT_DEV }),
			step('s', { parent: 'p', when: NOT_DEV }),
			step('d', { depends: ['s', 'a'], when: NOT_DEV }),
			step('e', { depends: ['a'], when: "steps.a.outputs.go == 'nodev'" }),
			step('f', { depends: ['d', 'e'] }),
		]);
		const ran = drain(scheduler, first, { a: { go: 'nodev' } });
		expect(ran).toEqual(['a', 'e', 'f']);
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('settles a sub-step without its own when under a skipped parent', () => {
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		const first = start(scheduler, [
			step('a'),
			step('p', { depends: ['a'], when: NOT_DEV }),
			step('s', { parent: 'p' }),
		]);
		expect(drain(scheduler, first, { a: { go: 'nodev' } })).toEqual(['a']);
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('evaluates the when of a sub-step whose parent ran', () => {
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		const first = start(scheduler, [
			step('a'),
			step('p', { depends: ['a'] }),
			step('s', { parent: 'p', when: NOT_DEV }),
		]);
		expect(drain(scheduler, first, { a: { go: 'nodev' } })).toEqual(['a', 'p']);
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('runs f when it depends only on skipped steps', () => {
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		const first = start(scheduler, [
			step('a'),
			step('d', { depends: ['a'], when: NOT_DEV }),
			step('f', { depends: ['d'] }),
		]);
		expect(drain(scheduler, first, { a: { go: 'nodev' } })).toEqual(['a', 'f']);
		expect(scheduler.isTerminal()).toBe(true);
	});

	it('ready set after a is exactly e when p and d are skipped', () => {
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		start(scheduler, [
			step('a'),
			step('p', { depends: ['a'], when: NOT_DEV }),
			step('e', { depends: ['a'], when: "steps.a.outputs.go == 'nodev'" }),
		]);
		scheduler.acknowledge('a');
		expect(ids(scheduler.complete('a', { type: 'completed', outputs: { go: 'nodev' } }))).toEqual(['e']);
	});
});

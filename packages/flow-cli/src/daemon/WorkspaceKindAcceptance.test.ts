import type { RunRequirementsRecord } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { WorkspaceKindAcceptance } from './WorkspaceKindAcceptance.js';

interface Source {
	guarantees: string[];
	/** undefined: no restriction */
	workspaces?: string[];
}

function acceptance(sources: Record<string, Source>): WorkspaceKindAcceptance {
	return new WorkspaceKindAcceptance({
		providersOfAll: required =>
			Object.entries(sources)
				.filter(([, source]) => required.every(entry => source.guarantees.includes(entry)))
				.map(([sourceId]) => sourceId),
		workspacesOf: sourceId => sources[sourceId]?.workspaces,
	});
}

const sandboxOnPool: Record<string, Source> = { sbx: { guarantees: ['sandbox'], workspaces: ['pool'] } };
const flowRequiring = (run: string[], steps: Record<string, string[]> = {}): RunRequirementsRecord => ({ run, steps });

describe('WorkspaceKindAcceptance', () => {
	it('refuses a run whose only providers accept other kinds, naming flow, kind, requirement, sources, accepted kinds and the fix', () => {
		const message = acceptance(sandboxOnPool).check('build', 'in-place', flowRequiring(['sandbox']));

		expect(message).toMatch(/Flow "build" requires sandbox/);
		expect(message).toMatch(/sbx \(pool\)/);
		expect(message).toMatch(/workspace: in-place/);
		expect(message).toMatch(/Fix: change "workspace:" to one of pool, or remove the requirement/);
	});

	it('names the step when only a step requires it', () => {
		const message = acceptance(sandboxOnPool).check('build', 'in-place', flowRequiring([], { test: ['sandbox'] }));

		expect(message).toMatch(/Step "test" of flow "build" requires sandbox/);
	});

	it('accepts when the flow uses a kind the provider lists', () => {
		expect(acceptance(sandboxOnPool).check('build', 'pool', flowRequiring(['sandbox']))).toBeUndefined();
	});

	it('accepts when at least one provider accepts the kind (mixed sources)', () => {
		const mixed = { ...sandboxOnPool, other: { guarantees: ['sandbox'], workspaces: ['in-place'] } };

		expect(acceptance(mixed).check('build', 'in-place', flowRequiring(['sandbox']))).toBeUndefined();
	});

	it('accepts when a provider declares no restriction', () => {
		const mixed = { ...sandboxOnPool, open: { guarantees: ['sandbox'] } };

		expect(acceptance(mixed).check('build', 'worktree', flowRequiring(['sandbox']))).toBeUndefined();
	});

	it('names every refusing provider with its kinds, and the union of kinds in the fix', () => {
		const two = { ...sandboxOnPool, other: { guarantees: ['sandbox'], workspaces: ['worktree'] } };

		const message = acceptance(two).check('build', 'in-place', flowRequiring(['sandbox']));

		expect(message).toMatch(/sbx \(pool\), other \(worktree\)/);
		expect(message).toMatch(/one of pool, worktree/);
	});

	it('does nothing when no source provides the set (the placement reports that) or the run requires nothing', () => {
		expect(acceptance(sandboxOnPool).check('build', 'in-place', flowRequiring(['net=filtered']))).toBeUndefined();
		expect(acceptance(sandboxOnPool).check('build', 'in-place', undefined)).toBeUndefined();
		expect(acceptance(sandboxOnPool).check('build', 'in-place', flowRequiring([], { a: [] }))).toBeUndefined();
	});

	it('only the sources covering the WHOLE set count', () => {
		const sources = {
			sbx: { guarantees: ['sandbox', 'fs=confined'], workspaces: ['pool'] },
			partial: { guarantees: ['sandbox'], workspaces: ['in-place'] },
		};

		expect(acceptance(sources).check('f', 'in-place', flowRequiring(['sandbox', 'fs=confined']))).toMatch(
			/sbx \(pool\)/
		);
		expect(acceptance(sources).check('f', 'in-place', flowRequiring(['sandbox']))).toBeUndefined();
	});

	it('refuses an undeterminable kind when every provider is restricted (fail closed), saying so', () => {
		const message = acceptance(sandboxOnPool).check('build', undefined, flowRequiring(['sandbox']));

		expect(message).toMatch(/does not name a workspace kind/);
	});
});

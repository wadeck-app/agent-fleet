#!/usr/bin/env node
/**
 * Offline: the series runs with and without the runs flagged as loaded (a run is flagged when its cpu maximum exceeded
 * 80 % or its lowest free memory was below 2.5 GiB; only run-level summaries were kept, not per-sample data).
 *   node packages/flow-sandbox/scripts/bench/Flagged.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'temp', 'm8');
const all = JSON.parse(fs.readFileSync(path.join(directory, 'series-results.json'), 'utf8'));
const flagged = run => run.sampler.cpuPct.max > 80 || run.sampler.freeGiB.min < 2.5;

function stats(values) {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (sorted.length === 0) return 'n/a';
	const m = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
	return `${Math.round(median)} (${Math.round(sorted[0])}-${Math.round(sorted.at(-1))}, n=${sorted.length})`;
}

const metrics = {
	'accepted -> first step done': run => run.startup.acceptedToFirstStepDoneMs,
	'sandbox create': run => run.startup.sandboxCreateMs,
	'warm trivial step wall (per-run median)': run => run.warmSummary.wallMs.median,
	'one-word step': run => run.model.ask.attemptDurationMs,
	'tool-call step': run => run.model.tool.attemptDurationMs,
};
const rows = [];
for (const variant of ['host', 'relay', 'exec']) {
	const runs = all.filter(run => run.variant === variant && run.ok);
	const clean = runs.filter(run => !flagged(run));
	rows.push(`${variant}: ${runs.length} runs, ${runs.length - clean.length} flagged (${runs.filter(flagged).map(run => `#${run.repetition} cpuMax ${run.sampler.cpuPct.max} freeMin ${run.sampler.freeGiB.min}`).join('; ') || 'none'})`);
	for (const [name, getter] of Object.entries(metrics))
		rows.push(`  ${name}: all ${stats(runs.map(getter))} | without flagged ${stats(clean.map(getter))}`);
}
console.log(rows.join('\n'));

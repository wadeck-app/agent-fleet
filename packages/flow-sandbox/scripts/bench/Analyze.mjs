#!/usr/bin/env node
/**
 * Offline aggregation of the raw M8 data in .claude/temp/m8 (no sandbox, no network): prints markdown tables.
 *   node packages/flow-sandbox/scripts/bench/Analyze.mjs <series|concurrency|fidelity>
 */
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'temp', 'm8');
const load = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));

function stats(values) {
	const sorted = values.filter(value => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
	if (sorted.length === 0) return 'n/a';
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
	const round = value => (Math.abs(value) >= 100 ? Math.round(value) : +value.toFixed(1));
	return `${round(median)} (${round(sorted[0])}-${round(sorted.at(-1))}, n=${sorted.length})`;
}

const table = (header, rows) =>
	[`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');

function series() {
	const all = load('series-results.json');
	const variants = ['host', 'relay', 'exec'].filter(variant => all.some(item => item.variant === variant));
	const ok = variant => all.filter(item => item.variant === variant && item.ok);
	console.log(`runs: ${variants.map(v => `${v} ok ${ok(v).length}/${all.filter(i => i.variant === v).length}`).join(', ')}\n`);
	const pick = (variant, getter) => stats(ok(variant).map(getter));
	console.log('### startup (ms, median (min-max, n))');
	const startupRows = [
		['`flow run` accepted (CLI + daemon)', s => s.startup.acceptMs],
		['run start -> wrapper registered (daemon launch + prerequisite checks)', s => s.startup.runStartToRegisteredMs],
		['wrapper process start -> registered', s => s.startup.wrapperStartToRegisteredMs],
		['sandbox create (`toSandboxReadyMs`)', s => s.startup.sandboxCreateMs],
		['preparation (credentials, rules, tool store; relay: until inner worker connected)', s => s.startup.preparationMs],
		['first step: step duration seen by daemon', s => s.startup.firstStepDurationMs],
		['accepted -> first step result (user-visible cold start)', s => s.startup.acceptedToFirstStepDoneMs],
		['sbx restart of the stopped sandbox + exec (`runtime.start`)', s => s.sbxRestartAfterStopMs],
	];
	console.log(table(['metric', ...variants], startupRows.map(([label, getter]) => [label, ...variants.map(v => pick(v, getter))])));
	console.log('\n### 24 warm trivial script steps (`echo ok`), per step ms, pooled over repetitions');
	const pooled = (variant, key) => stats(ok(variant).flatMap(s => s.trivialSteps.slice(1).map(step => step[key])));
	console.log(
		table(
			['metric', ...variants],
			[
				['step duration recorded by the daemon (attemptLog.durationMs)', 'attemptDurationMs'],
				['wall clock between consecutive step completions', 'wallMs'],
				['daemon gap (next start - previous completion)', 'gapMs'],
				['wrapper-measured step time (sandbox variants only)', 'wrapperStepMs'],
			].map(([label, key]) => [label, ...variants.map(v => pooled(v, key))])
		)
	);
	console.log(`\nfirst-trivial-step (cold) vs second (warm), per-rep medians:`);
	console.log(
		table(
			['metric', ...variants],
			[
				['first trivial step duration', s => s.trivialSteps[0].attemptDurationMs],
				['second trivial step duration', s => s.trivialSteps[1].attemptDurationMs],
				['all 25 steps, first done -> last done (ms)', s => s.warmSummary.totalWallFirstDoneToLastDoneMs],
			].map(([label, getter]) => [label, ...variants.map(v => pick(v, getter))])
		)
	);
	console.log('\n### model steps (ms)');
	console.log(
		table(
			['metric', ...variants],
			[
				['one-word step, daemon duration', s => s.model.ask.attemptDurationMs],
				['one-word step, ttft (claude)', s => s.model.ask.ttftMs],
				['Bash tool-call step, daemon duration', s => s.model.tool.attemptDurationMs],
				['Bash tool-call step, ttft (claude)', s => s.model.tool.ttftMs],
				['Bash tool-call step: tool calls', s => s.model.tool.toolCalls?.total],
				['one-word step cost (usd x1000)', s => s.model.ask.usd * 1000],
			].map(([label, getter]) => [label, ...variants.map(v => pick(v, getter))])
		)
	);
	console.log('\n### single-run host impact during the whole series run (one lifecycle)');
	console.log(
		table(
			['metric', ...variants],
			[
				['free memory at start (GiB)', s => s.sampler.freeGiB.first],
				['lowest free memory (GiB)', s => s.sampler.freeGiB.min],
				['drop (GiB)', s => s.sampler.freeGiB.first - s.sampler.freeGiB.min],
				['cpu mean (%)', s => s.sampler.cpuPct.mean],
				['cpu max (%)', s => s.sampler.cpuPct.max],
				['sandbox runtime processes, peak - baseline (MB)', s => (s.sampler.processGroups.sandboxRuntime?.peakMB ?? 0) - (s.sampler.processGroups.sandboxRuntime?.baselineMB ?? 0)],
				['node processes, peak - baseline (MB)', s => (s.sampler.processGroups.node?.peakMB ?? 0) - (s.sampler.processGroups.node?.baselineMB ?? 0)],
				['claude processes on the host, peak (MB)', s => s.sampler.processGroups.claude?.peakMB],
			].map(([label, getter]) => [label, ...variants.map(v => pick(v, getter))])
		)
	);
	console.log('\nafter the run:', JSON.stringify(Object.fromEntries(variants.map(v => [v, ok(v).map(s => s.sandboxesAfterRun?.map(x => x.status).join('/') ?? 'n/a')]))));
	const failed = all.filter(item => !item.ok);
	if (failed.length) console.log('\nFAILED RUNS:', JSON.stringify(failed.map(item => ({ v: item.variant, r: item.repetition, e: item.error ?? item.status })), null, 1));
}

function concurrency() {
	const parts = fs.readdirSync(directory).filter(name => /^concurrency-results.*.json$/.test(name) && name !== 'concurrency-results.json').map(load);
	const { results, stops } = { results: parts.flatMap(p => p.results), stops: parts.flatMap(p => p.stops) };
	const keys = [...new Set(results.map(item => `${item.variant}|${item.level}`))];
	const rows = keys.map(key => {
		const [variant, level] = key.split('|');
		const group = results.filter(item => item.variant === variant && String(item.level) === level);
		const ok = group.filter(item => item.ok);
		const runs = ok.flatMap(item => item.perRun);
		return [
			variant,
			level,
			`${ok.length}/${group.length}`,
			stats(runs.map(run => run.acceptedToRunDoneMs)),
			stats(runs.map(run => run.acceptedToFirstDoneMs)),
			stats(ok.map(item => item.allDoneMs)),
			stats(ok.map(item => item.nthSandboxReadyMs)),
			stats(ok.map(item => item.idle.freeGiB.last - item.sampler.freeGiB.min)),
			stats(ok.map(item => item.sampler.cpuPct.mean)),
			stats(ok.map(item => item.sampler.cpuPct.max)),
			stats(ok.map(item => (item.sampler.processGroups.sandboxRuntime?.peakMB ?? 0) - (item.sampler.processGroups.sandboxRuntime?.baselineMB ?? 0))),
			stats(ok.map(item => item.distinctWorkers)),
		];
	});
	console.log(
		table(
			['variant', 'N', 'ok/total', 'per-run total ms', 'per-run first step ms', 'all done ms', 'Nth sandbox ready ms', 'free mem drop GiB', 'cpu mean %', 'cpu max %', 'sandbox procs +MB', 'distinct workers'],
			rows
		)
	);
	console.log('\nstops:', JSON.stringify(stops, null, 1));
	const failed = results.filter(item => !item.ok);
	if (failed.length) console.log('FAILED:', JSON.stringify(failed.map(item => ({ v: item.variant, n: item.level, r: item.repetition, e: item.error ?? item.aborted })), null, 1));
}

function flatten(object, prefix = '', out = {}) {
	for (const [key, value] of Object.entries(object ?? {})) {
		const name = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, name, out);
		else out[name] = Array.isArray(value) ? `[array of ${value.length}]` : value;
	}
	return out;
}

function fidelity() {
	const variants = ['host', 'relay', 'exec'];
	const flats = {};
	for (const variant of variants) {
		flats[variant] = [];
		for (let repetition = 1; repetition <= 9; repetition += 1) {
			const file = path.join(directory, 'series', `${variant}-${repetition}-modelsteps.json`);
			if (!fs.existsSync(file)) continue;
			const data = JSON.parse(fs.readFileSync(file, 'utf8'));
			flats[variant].push({ ask: flatten(data.ask), tool: flatten(data.tool), raw: data });
		}
	}
	for (const stepName of ['ask', 'tool']) {
		const fields = [...new Set(variants.flatMap(v => flats[v].flatMap(item => Object.keys(item[stepName]))))].filter(
			field => !field.startsWith('io.outputs.stdout') && !field.startsWith('io.stdout')
		);
		const rows = fields.map(field => {
			const cells = variants.map(v => {
				const values = flats[v].map(item => item[stepName][field]);
				const present = values.filter(value => value !== undefined);
				if (present.length === 0) return 'ABSENT';
				const numeric = present.every(value => typeof value === 'number');
				if (numeric) return `${stats(present)}`;
				const sample = String(present[0]).replace(/[\\/]flow-test-iso-[A-Za-z0-9]+/g, '/<iso>').slice(0, 60);
				return present.length < values.length ? `present ${present.length}/${values.length}: ${sample}` : sample === '' ? '(empty string)' : sample;
			});
			return [`\`${field}\``, ...cells];
		});
		console.log(`\n### ${stepName} step record fields (n per variant: ${variants.map(v => flats[v].length).join('/')})`);
		console.log(table(['field', ...variants], rows));
	}
	// tool call detail from the stdout stream: tool names and one result line
	for (const variant of variants) {
		const sample = flats[variant][0]?.raw?.tool;
		const text = sample?.io?.outputs?.stdout?.text ?? '';
		console.log(`\n${variant}: tool step stdout stored ${text.length} chars, truncated=${sample?.io?.outputs?.stdout?.truncated}, mentions Bash tool_use: ${/"name":"Bash"/.test(text)}, tool_result: ${/tool_result/.test(text)}`);
	}
	if (fs.existsSync(path.join(directory, 'fidelity-logs.json'))) {
		console.log('\n### daemon log lines per step (live capture, n=1 per variant)');
		for (const entry of load('fidelity-logs.json')) console.log(entry.variant, entry.error ?? JSON.stringify({ count: entry.logLineCount, byStep: entry.byStep }));
	}
}

const which = process.argv[2];
if (which === 'series') series();
else if (which === 'concurrency') concurrency();
else if (which === 'fidelity') fidelity();
else {
	console.error('usage: node Analyze.mjs <series|concurrency|fidelity>');
	process.exit(2);
}

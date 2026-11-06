/**
 * Scenarios 1-3 of the M8 benchmark: startup, per-step overhead (25 trivial script steps) and model steps
 * (one word, and one with a Bash tool call), one full lifecycle (isolated daemon + wrapper + sandbox) per repetition.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
	BenchEnv,
	Sampler,
	flowHeader,
	modelStep,
	outputDirectory,
	parseWrapperTimings,
	runtime,
	saveJson,
	scriptStep,
	sleep,
	stats,
	stepFacts,
} from './BenchLib.mjs';

export const TRIVIAL_STEPS = 25;

export function seriesFlow(variant) {
	let yaml = flowHeader({ id: 'bench-series', labelled: variant !== 'host' });
	const ids = [];
	for (let index = 0; index < TRIVIAL_STEPS; index += 1) {
		const id = `t${String(index).padStart(2, '0')}`;
		yaml += scriptStep({ id, depends: ids.at(-1), script: 'echo ok' });
		ids.push(id);
	}
	yaml += modelStep({ id: 'ask', depends: ids.at(-1), prompt: 'Reply with the single word OK and nothing else.' });
	yaml += modelStep({
		id: 'tool',
		depends: 'ask',
		extra: '      skipPermissions: true\n',
		prompt:
			'Use the Bash tool exactly once to run: echo bench-tool-ok   Then reply with the single word DONE and nothing else.',
	});
	return { yaml, ids };
}

export const logTimestamp = (text, regex) => {
	const line = text.split('\n').find(candidate => regex.test(candidate));
	return line === undefined ? undefined : Date.parse(line.slice(0, 24));
};

export async function seriesRepetition(variant, repetition) {
	const env = new BenchEnv({ variant });
	const result = { variant, repetition, ok: false };
	const sampler = new Sampler();
	try {
		await env.prepare();
		await env.startDaemon();
		const { yaml, ids } = seriesFlow(variant);
		const flowPath = env.writeFlow('bench-series', yaml);
		sampler.start();
		const run = await env.run(flowPath);
		const record = await env.waitSettled(run.executionId, 420_000);
		result.sampler = sampler.stop();
		result.status = record.status;
		const wrapperText = env.allWrapperText();
		const { timing, processTiming } = parseWrapperTimings(wrapperText);
		const first = stepFacts(record, ids[0]);
		const marks = {
			wrapperStarting: logTimestamp(wrapperText, /info: starting:/),
			registered: logTimestamp(wrapperText, /registered with the daemon/),
			created: logTimestamp(wrapperText, /Sandbox ".*" created for run/),
			innerConnected: logTimestamp(wrapperText, /inner worker connected/),
		};
		const runStartedAt = Date.parse(record.startedAt);
		result.startup = {
			acceptMs: run.acceptedAt - run.issuedAt,
			runStartToFirstStepStartMs: first.startedAt - runStartedAt,
			// sandbox variants: wrapper internals
			wrapperStartToRegisteredMs:
				marks.registered && marks.wrapperStarting ? marks.registered - marks.wrapperStarting : undefined,
			runStartToRegisteredMs: marks.registered ? marks.registered - runStartedAt : undefined,
			sandboxCreateMs: timing[0]?.toSandboxReadyMs,
			// relay: created -> inner worker connected; exec: prepareMs of the timing line
			preparationMs:
				variant === 'exec'
					? timing[0]?.prepareMs
					: marks.innerConnected && marks.created
						? marks.innerConnected - marks.created
						: undefined,
			relayToForwardedMs: variant === 'relay' ? timing[0]?.toForwardedMs : undefined,
			firstStepDurationMs: first.attemptDurationMs,
			// user-visible: `flow run` accepted -> first step result in the daemon record
			acceptedToFirstStepDoneMs: first.completedAt - run.acceptedAt,
			registeredToFirstStepDoneMs: marks.registered ? first.completedAt - marks.registered : undefined,
		};
		const facts = ids.map(id => stepFacts(record, id));
		result.trivialSteps = facts.map((fact, index) => ({
			id: fact.id,
			attemptDurationMs: fact.attemptDurationMs,
			wallMs: index === 0 ? undefined : fact.completedAt - facts[index - 1].completedAt,
			gapMs: index === 0 ? undefined : fact.startedAt - facts[index - 1].completedAt,
			wrapperStepMs: timing.find(item => item.stepId === fact.id)?.stepMs,
		}));
		const warm = result.trivialSteps.slice(1);
		result.warmSummary = {
			attemptDurationMs: stats(warm.map(step => step.attemptDurationMs)),
			wallMs: stats(warm.map(step => step.wallMs)),
			gapMs: stats(warm.map(step => step.gapMs)),
			wrapperStepMs: stats(warm.map(step => step.wrapperStepMs)),
			totalWallFirstDoneToLastDoneMs: facts.at(-1).completedAt - facts[0].completedAt,
		};
		result.processTiming = processTiming;
		result.model = {};
		for (const id of ['ask', 'tool']) {
			const fact = stepFacts(record, id);
			const step = record.steps[id];
			result.model[id] = {
				status: fact.status,
				attemptDurationMs: fact.attemptDurationMs,
				wallMs: fact.completedAt - fact.startedAt,
				wrapperStepMs: timing.find(item => item.stepId === id)?.stepMs,
				ttftMs: step.meta?.ttft_ms,
				durationMs: step.meta?.duration_ms,
				sessionId: step.meta?.session_id,
				toolCalls: step.meta?.tool_calls,
				usd: step.meta?.cost?.usd,
				error: fact.error,
			};
		}
		result.ok = record.status === 'completed';
		// full model steps for the fidelity comparison (scenario 5)
		fs.mkdirSync(path.join(outputDirectory, 'series'), { recursive: true });
		fs.writeFileSync(
			path.join(outputDirectory, 'series', `${variant}-${repetition}-modelsteps.json`),
			JSON.stringify({ ask: record.steps.ask, tool: record.steps.tool, executionId: run.executionId }, null, 1)
		);
		// daemon + wrapper end
		await sleep(2500);
		result.daemonStillRunning = env.daemonAlive();
		if (env.daemonAlive()) await env.stopDaemonGracefully();
		const own = await env.ownSandboxes();
		result.sandboxesAfterRun = own.map(item => ({ name: item.name, status: item.status }));
		if (own.length > 0) {
			const started = Date.now();
			try {
				await runtime.start(own[0].name);
				result.sbxRestartAfterStopMs = Date.now() - started;
			} catch (error) {
				result.sbxRestartError = error.message;
			}
		}
	} catch (error) {
		result.error = error.message;
		result.sampler ??= sampler.stop();
		result.daemonTail = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8').slice(-1500) : '';
		result.wrapperTail = env.allWrapperText().slice(-1500);
	} finally {
		const started = Date.now();
		result.cleanupNotes = await env.cleanup();
		result.cleanupMs = Date.now() - started;
	}
	return result;
}

export async function runSeries({ variants, reps }) {
	const results = [];
	for (let repetition = 1; repetition <= reps; repetition += 1) {
		for (const variant of variants) {
			console.log(`--- series ${variant} #${repetition}`);
			const result = await seriesRepetition(variant, repetition);
			console.log(
				result.ok
					? `    ok: first step done ${result.startup.acceptedToFirstStepDoneMs} ms after accept; warm wall median ${result.warmSummary.wallMs.median} ms; ask ${result.model.ask.attemptDurationMs} ms; tool ${result.model.tool.attemptDurationMs} ms; min free ${result.sampler.freeGiB.min} GiB`
					: `    FAILED: ${result.error ?? result.status}`
			);
			results.push(result);
			saveJson('series-results.json', results);
		}
	}
	return results;
}

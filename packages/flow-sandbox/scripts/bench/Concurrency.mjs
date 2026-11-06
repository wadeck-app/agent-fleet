/**
 * Scenario 4 of the M8 benchmark: N simultaneous runs through one variant (N wrapper sources, one wrapper = one run =
 * one sandbox), host memory / CPU impact, time to ready of the Nth sandbox. The machine is low on memory: before every
 * level the free physical memory is read and the level is NOT run (and no higher level either) when the free memory
 * would drop below MIN_FREE_GIB assuming SANDBOX_GIB per sandbox; a watchdog aborts a running level below WATCHDOG_GIB.
 */
import fs from 'node:fs';

import {
	BenchEnv,
	MIN_FREE_GIB,
	SANDBOX_GIB,
	Sampler,
	flowHeader,
	freeGiB,
	modelStep,
	parseWrapperTimings,
	saveJson,
	scriptStep,
	sleep,
	stepFacts,
} from './BenchLib.mjs';

const WATCHDOG_GIB = 1.2;

function concurrencyFlow(variant, index) {
	return (
		flowHeader({ id: `bench-conc-${index}`, labelled: variant !== 'host' }) +
		scriptStep({ id: 's1' }) +
		scriptStep({ id: 's2', depends: 's1' }) +
		modelStep({ id: 'ask', depends: 's2', prompt: 'Reply with the single word OK and nothing else.' })
	);
}

export async function concurrencyRepetition(variant, level, repetition) {
	const env = new BenchEnv({ variant, sources: level });
	const result = { variant, level, repetition, ok: false, freeBeforeGiB: +freeGiB().toFixed(2) };
	const sampler = new Sampler();
	let aborted;
	let watchdog;
	try {
		await env.prepare();
		await env.startDaemon();
		const flowPaths = Array.from({ length: level }, (_, index) =>
			env.writeFlow(`conc-${index}`, concurrencyFlow(variant, index))
		);
		// idle reference of the machine just before the runs
		const idle = new Sampler({ processEveryMs: 3_600_000 }).start();
		await sleep(3000);
		result.idle = idle.stop();
		sampler.start();
		watchdog = setInterval(() => {
			if (freeGiB() < WATCHDOG_GIB && aborted === undefined) {
				aborted = `free memory ${freeGiB().toFixed(2)} GiB < ${WATCHDOG_GIB} GiB: run aborted by the watchdog`;
				if (env.daemonAlive()) env.daemon.kill();
			}
		}, 500);
		const issuedAt = Date.now();
		// all N `flow run` at once
		const runs = await Promise.all(flowPaths.map(flowPath => env.run(flowPath)));
		const records = await Promise.all(
			runs.map(run => env.waitSettled(run.executionId, 420_000).catch(error => ({ error: error.message })))
		);
		result.sampler = sampler.stop();
		clearInterval(watchdog);
		result.aborted = aborted;
		const wrapperText = env.allWrapperText();
		const { timing } = parseWrapperTimings(wrapperText);
		result.perRun = records.map((record, index) => {
			if (record.error) return { error: record.error };
			const first = stepFacts(record, 's1');
			const ask = stepFacts(record, 'ask');
			return {
				status: record.status,
				acceptedToFirstDoneMs: first?.completedAt - runs[index].acceptedAt,
				acceptedToRunDoneMs: Date.parse(record.completedAt) - runs[index].acceptedAt,
				askMs: ask?.attemptDurationMs,
				sourceId: first?.sourceId ?? record.steps?.s1?.sourceId,
				workerId: record.steps?.s1?.workerId,
			};
		});
		result.distinctWorkers = new Set(result.perRun.map(item => item.workerId).filter(Boolean)).size;
		result.sandboxCreateMs = timing.filter(item => item.toSandboxReadyMs > 0).map(item => item.toSandboxReadyMs);
		// time to ready of the Nth sandbox: from issuing the runs to the last "Sandbox ... created" line
		const created = wrapperText
			.split('\n')
			.filter(line => /Sandbox ".*" created for run/.test(line))
			.map(line => Date.parse(line.slice(0, 24)));
		result.createdAtOffsetsMs = created.map(time => time - issuedAt).sort((a, b) => a - b);
		result.nthSandboxReadyMs = result.createdAtOffsetsMs.at(-1);
		result.allDoneMs = Math.max(...records.map(record => (record.completedAt ? Date.parse(record.completedAt) : 0))) - issuedAt;
		result.ok = records.every(record => record.status === 'completed') && aborted === undefined;
		await sleep(2500);
		if (env.daemonAlive()) await env.stopDaemonGracefully();
		result.sandboxesAfterRun = (await env.ownSandboxes()).map(item => ({ name: item.name, status: item.status }));
	} catch (error) {
		result.error = error.message;
		result.aborted = aborted;
		result.sampler ??= sampler.stop();
		result.daemonTail = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8').slice(-1500) : '';
		result.wrapperTail = env.allWrapperText().slice(-2000);
	} finally {
		clearInterval(watchdog);
		result.cleanupNotes = await env.cleanup();
	}
	return result;
}

export async function runConcurrency({ variants, reps, levels }) {
	const results = [];
	const stops = [];
	const repetitions = Math.min(reps, 3);
	for (const variant of variants) {
		for (const level of levels) {
			const perSandbox = variant === 'host' ? 1 : SANDBOX_GIB;
			const free = freeGiB();
			const predicted = free - level * perSandbox;
			if (predicted < MIN_FREE_GIB) {
				const stop = {
					variant,
					level,
					freeGiB: +free.toFixed(2),
					predictedFreeGiB: +predicted.toFixed(2),
					reason: `free memory ${free.toFixed(2)} GiB minus ${level} x ${perSandbox} GiB would leave ${predicted.toFixed(2)} GiB < ${MIN_FREE_GIB} GiB`,
				};
				console.log(`STOP ${variant} at N=${level}: ${stop.reason}`);
				stops.push(stop);
				break;
			}
			for (let repetition = 1; repetition <= repetitions; repetition += 1) {
				console.log(`--- concurrency ${variant} N=${level} #${repetition} (free ${free.toFixed(2)} GiB)`);
				const result = await concurrencyRepetition(variant, level, repetition);
				console.log(
					result.ok
						? `    ok: all done ${result.allDoneMs} ms, nth sandbox ready ${result.nthSandboxReadyMs ?? 'n/a'} ms, distinct workers ${result.distinctWorkers}, min free ${result.sampler.freeGiB.min} GiB, cpu mean ${result.sampler.cpuPct.mean}%`
						: `    FAILED: ${result.error ?? result.aborted ?? 'not all runs completed'}`
				);
				results.push(result);
				saveJson(process.env.BENCH_CONC_FILE ?? 'concurrency-results.json', { results, stops });
				if (result.aborted) {
					stops.push({ variant, level, reason: result.aborted });
					break;
				}
				await sleep(3000);
			}
		}
	}
	saveJson(process.env.BENCH_CONC_FILE ?? 'concurrency-results.json', { results, stops });
	return results;
}

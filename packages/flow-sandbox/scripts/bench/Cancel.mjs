/**
 * Scenario 6 of the M8 benchmark: cancel and leak behaviour. For each case one isolated daemon runs
 * `pre -> long (sleep 4711, optionally timeout:) -> after`; the case then ends `long` in a hard way and the bench
 * observes what remains: record statuses and error texts, daemon / wrapper log lines, `sbx ls`, host processes that
 * mention this run, processes in the VM. Cases: timeout (step `timeout:`), killWrapper (TerminateProcess of the wrapper
 * only), stopDaemon (`flow stop`, then a daemon restart), killDaemon (TerminateProcess of the daemon we started).
 */
import fs from 'node:fs';

import {
	BenchEnv,
	findProcesses,
	flowHeader,
	runtime,
	saveJson,
	sbxLsText,
	scriptStep,
	sleep,
} from './BenchLib.mjs';

const SLEEP_MARKER = 'sleep 4711';

function cancelFlow(variant, withTimeout) {
	return (
		flowHeader({ id: 'bench-cancel', labelled: variant !== 'host' }) +
		scriptStep({ id: 'pre' }) +
		scriptStep({
			id: 'long',
			depends: 'pre',
			script: SLEEP_MARKER,
			extra: withTimeout ? '      timeout: 8\n' : '',
		}) +
		scriptStep({ id: 'after', depends: 'long', script: 'echo after-ran' })
	);
}

const summarize = record =>
	record === undefined
		? 'no record'
		: {
				status: record.status,
				steps: Object.fromEntries(
					Object.entries(record.steps ?? {}).map(([id, step]) => [
						id,
						{
							status: step.status,
							error: step.error ? String(step.error).slice(0, 500) : undefined,
							workerId: step.workerId,
							attempts: step.attempts,
							startedAt: step.startedAt,
							completedAt: step.completedAt,
						},
					])
				),
			};

async function vmPs(sandboxName) {
	try {
		const result = await runtime.exec({
			sandbox: sandboxName,
			command: ['sh', '-c', `ps -eo pid,etime,args | grep "${SLEEP_MARKER}" | grep -v grep || echo none`],
			signal: AbortSignal.timeout(60_000),
		});
		return result.stdout.trim();
	} catch (error) {
		return `exec failed: ${error.message}`;
	}
}

async function runCase(variant, caseName) {
	const env = new BenchEnv({ variant, idleMinutes: 5 });
	const out = { variant, case: caseName, timeline: [], checkpoints: [] };
	const fragments = () => [env.root.split(/[\\/]/).at(-1), SLEEP_MARKER, ...env.wrapperIds.map(id => `flow-sbx-${id}`)];
	try {
		await env.prepare();
		await env.startDaemon();
		const flowPath = env.writeFlow('bench-cancel', cancelFlow(variant, caseName === 'timeout'));
		const run = await env.run(flowPath);
		out.executionId = run.executionId;
		await env.waitRecord(run.executionId, r => r.steps?.long?.status === 'running', 120_000, 'step long to run');
		const longStartedAt = Date.now();
		// the process must exist in the VM before we break anything
		await sleep(variant === 'host' ? 1500 : 3500);
		const beforeSandboxes = await env.ownSandboxes();
		out.sandboxBefore = beforeSandboxes.map(item => ({ name: item.name, status: item.status }));
		out.vmProcessBefore = beforeSandboxes[0] ? await vmPs(beforeSandboxes[0].name) : 'no sandbox';
		out.hostProcessesBefore = findProcesses(fragments());

		let action = 'none (the step timeout is the event)';
		if (caseName === 'killWrapper') {
			const wrappers = findProcesses(env.wrapperIds.map(id => `--wrapper-id ${id}`)).filter(
				item => /^node(\.exe)?$/i.test(item.name) && /Wrapper\.mjs/.test(item.cmd)
			);
			out.killedWrapperPids = wrappers.map(item => item.pid);
			for (const item of wrappers) process.kill(item.pid);
			action = `TerminateProcess of wrapper pid(s) ${out.killedWrapperPids.join(',')}`;
		} else if (caseName === 'stopDaemon') {
			const stop = env.flow(['stop']);
			action = `flow stop (exit ${stop.status}): ${`${stop.stdout}${stop.stderr}`.trim().slice(0, 300)}`;
		} else if (caseName === 'killDaemon') {
			env.daemon.kill();
			action = `TerminateProcess of daemon pid ${env.daemon.pid}`;
		}
		out.action = action;
		const actionAt = Date.now();

		const window = caseName === 'timeout' ? 45_000 : 100_000;
		const checkpoints = new Set([3, 15, 35, 70, 95]);
		let lastLs = 0;
		while (Date.now() - actionAt < window) {
			const record = env.record(run.executionId);
			const offset = Math.round((Date.now() - actionAt) / 1000);
			out.timeline.push({
				t: offset,
				run: record?.status,
				long: record?.steps?.long?.status,
				after: record?.steps?.after?.status,
				daemonAlive: env.daemonAlive(),
			});
			if (Date.now() - lastLs > 5000) {
				lastLs = Date.now();
				out.timeline.at(-1).sandboxes = (await env.ownSandboxes()).map(item => item.status).join(',');
			}
			for (const checkpoint of [...checkpoints]) {
				if (offset >= checkpoint) {
					checkpoints.delete(checkpoint);
					out.checkpoints.push({
						t: checkpoint,
						sbxLs: sbxLsText(),
						hostProcesses: findProcesses(fragments()).map(item => `${item.pid} ${item.name} ${String(item.cmd ?? item.error).slice(0, 110)}`),
					});
				}
			}
			if (['completed', 'failed', 'cancelled'].includes(record?.status) && caseName === 'timeout' && offset > 20) break;
			await sleep(1000);
		}
		out.stepTimeoutToFailureMs =
			caseName === 'timeout' && env.record(run.executionId)?.steps?.long?.completedAt
				? Date.parse(env.record(run.executionId).steps.long.completedAt) - longStartedAt
				: undefined;
		out.finalRecord = summarize(env.record(run.executionId));
		const daemonText = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8') : '';
		out.daemonLogInteresting = daemonText
			.split('\n')
			.filter(line => /worker|lost|disconnect|interrupt|stopp|cancel|timed out|launch|source/i.test(line))
			.filter(line => !/DeprecationWarning|trace-deprecation|ssh-agent|network-mode|policy|signed-in|version: sbx|healthy/.test(line))
			.slice(-25)
			.map(line => line.slice(0, 260));
		out.wrapperLogTail = env.allWrapperText().split('\n').filter(Boolean).slice(-14).map(line => line.slice(0, 220));

		if (caseName === 'stopDaemon' || caseName === 'killDaemon') {
			// What does a new daemon make of the interrupted run? (observation only)
			await env.startDaemon().catch(error => (out.restartError = error.message));
			await sleep(12_000);
			out.afterDaemonRestart = {
				record: summarize(env.record(run.executionId)),
				sbxLs: sbxLsText(),
				hostProcesses: findProcesses(fragments()).map(item => `${item.pid} ${item.name} ${String(item.cmd ?? item.error).slice(0, 110)}`),
				wrapperStarts: (env.allWrapperText().match(/info: starting:/g) ?? []).length,
			};
		}

		out.sandboxAfter = (await env.ownSandboxes()).map(item => ({ name: item.name, status: item.status }));
		const left = out.sandboxAfter[0];
		if (left) {
			out.vmProcessAfter = await vmPs(left.name);
			out.vmProcessAfterNote = `checked with an exec; sandbox was ${left.status} before this check`;
		}
		out.hostProcessesAfter = findProcesses(fragments()).map(item => `${item.pid} ${item.name} ${String(item.cmd ?? item.error).slice(0, 110)}`);
	} catch (error) {
		out.error = error.message;
		out.daemonTail = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8').slice(-1500) : '';
	} finally {
		// kill what is still ours: sleep processes of this run on the host, the daemon, then sandboxes and the tree
		for (const item of findProcesses([SLEEP_MARKER])) {
			if (/^sleep(\.exe)?$/i.test(item.name)) {
				try {
					process.kill(item.pid);
				} catch {
					// already gone
				}
			}
		}
		out.cleanupNotes = await env.cleanup();
	}
	return out;
}

export async function runCancel({ variants }) {
	const results = [];
	const plan = {
		host: ['timeout', 'killDaemon'],
		relay: ['timeout', 'killWrapper', 'stopDaemon', 'killDaemon'],
		exec: ['timeout', 'killWrapper', 'stopDaemon', 'killDaemon'],
	};
	for (const variant of variants) {
		for (const caseName of plan[variant]) {
			if (process.env.BENCH_CASES && !process.env.BENCH_CASES.split(',').includes(`${variant}:${caseName}`)) continue;
			console.log(`--- cancel ${variant} / ${caseName}`);
			const result = await runCase(variant, caseName);
			console.log(
				`    run=${result.finalRecord?.status} long=${result.finalRecord?.steps?.long?.status} sandbox=${JSON.stringify(result.sandboxAfter)} ${result.error ? 'ERROR ' + result.error : ''}`
			);
			results.push(result);
			saveJson(process.env.BENCH_CANCEL_FILE ?? 'cancel-results.json', results);
		}
	}
	return results;
}

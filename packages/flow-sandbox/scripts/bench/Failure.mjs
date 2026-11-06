/**
 * Scenario 7 of the M8 benchmark: failure injection. What does the user see, and where?
 *  - imageMissing:    --image flow-sandbox:does-not-exist (sandbox create fails at the first step)
 *  - sbxMissing:      SBX_PATH points to a file that does not exist (the wrapper cannot start)
 *  - endpointDown:    the sandbox-scoped allow rule of the host credential endpoint is removed while a hold step runs
 *  - invalidProfile:  --profile claude=<profile that does not exist> (what an expired SSO looks like to the plumbing);
 *                     host variant: AWS_PROFILE=<same>
 * Every flow starts with a `probe` script that prints the hostname: it shows WHERE the step ran (a sandbox label that
 * silently falls back to the host would show the host name).
 */
import fs from 'node:fs';
import os from 'node:os';

import { BenchEnv, findProcesses, flowHeader, modelStep, saveJson, sbx, sbxLsText, scriptStep, sleep } from './BenchLib.mjs';

const BAD_PROFILE = 'bench-no-such-profile';

function failureFlow(variant, withHold) {
	return (
		flowHeader({ id: 'bench-failure', labelled: variant !== 'host' }) +
		scriptStep({ id: 'probe', script: 'echo "ran-on=$(hostname)"' }) +
		(withHold ? scriptStep({ id: 'hold', depends: 'probe', script: 'sleep 25' }) : '') +
		modelStep({
			id: 'ask',
			depends: withHold ? 'hold' : 'probe',
			prompt: 'Reply with the single word OK and nothing else.',
		})
	);
}

const stepView = step =>
	step === undefined
		? undefined
		: {
				status: step.status,
				error: step.error ? String(step.error).slice(0, 700) : undefined,
				stdout: step.io?.stdout?.text?.slice(0, 400),
				stderr: step.io?.stderr?.text?.slice(0, 700),
				attempts: step.attempts,
				workerId: step.workerId,
			};

async function runCase(variant, caseName) {
	const options = { variant, idleMinutes: 5 };
	if (caseName === 'imageMissing') options.image = 'flow-sandbox:does-not-exist';
	if (caseName === 'sbxMissing') options.env = { SBX_PATH: 'C:/bench-nonexistent/sbx.exe' };
	if (caseName === 'invalidProfile') {
		options.profile = BAD_PROFILE;
		// the host worker picks the profile from the environment of the daemon
		options.env = { AWS_PROFILE: BAD_PROFILE };
	}
	const env = new BenchEnv(options);
	const out = { variant, case: caseName };
	const startedAt = Date.now();
	try {
		await env.prepare();
		await env.startDaemon();
		const flowPath = env.writeFlow('bench-failure', failureFlow(variant, caseName === 'endpointDown'));
		const run = await env.run(flowPath);
		out.executionId = run.executionId;
		out.flowRunOutput = run.output().slice(0, 600);

		if (caseName === 'endpointDown') {
			await env.waitRecord(run.executionId, r => r.steps?.hold?.status === 'running', 120_000, 'hold to run');
			const text = env.allWrapperText();
			const port = /endpointPort=(\d+)/.exec(text)?.[1];
			const sandbox = (await env.ownSandboxes())[0]?.name;
			out.removedRule = `localhost:${port} on ${sandbox}`;
			if (port && sandbox) {
				const removed = sbx(['policy', 'rm', 'network', '--force', '--sandbox', sandbox, '--resource', `localhost:${port}`]);
				out.removeRuleResult = { status: removed.status, stdout: removed.stdout.trim().slice(0, 300), stderr: removed.stderr.trim().slice(0, 300) };
			}
		}

		// settle, or give up after 150 s and say so: a run that never ends is a finding
		let record;
		try {
			record = await env.waitSettled(run.executionId, 150_000);
			out.settled = true;
		} catch (error) {
			out.settled = false;
			out.settleNote = error.message;
			record = env.record(run.executionId);
		}
		out.msToSettleOrCut = Date.now() - startedAt;
		out.runStatus = record?.status;
		out.steps = Object.fromEntries(Object.entries(record?.steps ?? {}).map(([id, step]) => [id, stepView(step)]));
		const ranOn = /ran-on=(\S+)/.exec(record?.steps?.probe?.io?.stdout?.text ?? '')?.[1];
		out.probeRanOn = ranOn;
		out.hostHostname = os.hostname();
		out.probeRanOnHost = ranOn === undefined ? 'unknown (probe did not run)' : ranOn.toLowerCase() === os.hostname().toLowerCase();
		const show = env.flow(['show', run.executionId]);
		out.flowShowText = `${show.stdout}${show.stderr}`.slice(0, 2500);
		const daemonText = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8') : '';
		out.daemonLogLines = daemonText
			.split('\n')
			.filter(line => /error|fail|warn|refus|cannot|could not|not found|missing|expired|denied|launch|ENOENT|ERR_/i.test(line))
			.filter(line => !/DeprecationWarning|trace-deprecation|ssh-agent|network-mode|git|ProjectScope|project add|detects a project|NoProjectInScope/i.test(line))
			.slice(0, 20)
			.map(line => line.slice(0, 320));
		out.wrapperLogLines = env
			.allWrapperText()
			.split('\n')
			.filter(line => / (warn|error):/.test(line) && !/ssh-agent|network-mode|outside the sandbox mounts/.test(line))
			.slice(0, 15)
			.map(line => line.slice(0, 320));
		out.sandboxes = (await env.ownSandboxes()).map(item => ({ name: item.name, status: item.status }));
		out.sbxLs = sbxLsText();
		out.wrapperStarts = (env.allWrapperText().match(/info: starting:/g) ?? []).length;
		out.hostProcessesWithRoot = findProcesses([env.root.split(/[\\/]/).at(-1)]).length;
	} catch (error) {
		out.error = error.message;
		out.daemonTail = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8').slice(-1800) : '';
	} finally {
		await sleep(500);
		out.cleanupNotes = await env.cleanup();
	}
	return out;
}

export async function runFailure({ variants }) {
	const results = [];
	const plan = {
		host: ['invalidProfile'],
		relay: ['imageMissing', 'sbxMissing', 'endpointDown', 'invalidProfile'],
		exec: ['imageMissing', 'sbxMissing', 'endpointDown', 'invalidProfile'],
	};
	for (const variant of variants) {
		for (const caseName of plan[variant]) {
			if (process.env.BENCH_CASES && !process.env.BENCH_CASES.split(',').includes(`${variant}:${caseName}`)) continue;
			console.log(`--- failure ${variant} / ${caseName}`);
			const result = await runCase(variant, caseName);
			console.log(
				`    run=${result.runStatus} settled=${result.settled} ranOnHost=${result.probeRanOnHost} ${result.error ? 'ERROR ' + result.error : ''}`
			);
			results.push(result);
			saveJson(process.env.BENCH_FAIL_FILE ?? 'failure-results.json', results);
		}
	}
	return results;
}

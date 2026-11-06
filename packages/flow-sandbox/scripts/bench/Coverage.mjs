/**
 * Scenario 8 of the M8 benchmark: tool and feature coverage per variant. One fresh isolated daemon (one wrapper = one
 * run) per case; a case that does not settle within CUT_MS is cut and reported as such.
 *  - codex:     provider codex, Bedrock model of the OpenAI-on-Bedrock form, one word
 *  - opencode:  provider opencode, Bedrock Claude model, one word
 *  - cmdShell:  a script step with shell: cmd and the sandbox label
 *  - mcp:       a model step that calls the provideSteps MCP tool; where does the injected step run?
 *  - resume:    session.continue of a first model step (append) in the same run
 */
import fs from 'node:fs';
import os from 'node:os';

import { BenchEnv, flowHeader, modelStep, saveJson, sbxLsText, scriptStep } from './BenchLib.mjs';

const CUT_MS = 120_000;

function caseFlow(variant, caseName) {
	const header = flowHeader({ id: `bench-cov-${caseName.toLowerCase()}`, labelled: variant !== 'host' });
	switch (caseName) {
		case 'codex':
			return (
				header +
				modelStep({
					id: 'ask',
					extra: '      provider: codex\n',
					model: 'openai.gpt-5.6-terra',
					prompt: 'Reply with the single word OK and nothing else.',
				})
			);
		case 'opencode':
			return (
				header +
				modelStep({
					id: 'ask',
					extra: '      provider: opencode\n',
					model: 'amazon-bedrock/us.anthropic.claude-sonnet-5-5',
					prompt: 'Reply with the single word OK and nothing else.',
				})
			);
		case 'cmdShell':
			return (
				header +
				`    - id: shell
      name: shell
      type: script
      shell: cmd
      script: echo cmd-ran
`
			);
		case 'mcp':
			return (
				header +
				modelStep({
					id: 'inject',
					extra: '      skipPermissions: true\n',
					prompt:
						'Call the provideSteps tool exactly once with a single step whose id is "from-model", whose type is "script" and whose script is: hostname\n          After the tool call succeeds, reply with the single word DONE.',
				})
			);
		case 'resume':
			return (
				header +
				modelStep({
					id: 'first',
					prompt: 'Remember the secret word PINEAPPLE. Reply with the single word OK and nothing else.',
				}) +
				modelStep({
					id: 'second',
					depends: 'first',
					extra: '      session:\n          continue: first\n          mode: append\n',
					prompt: 'What was the secret word? Reply with that single word and nothing else.',
				})
			);
		default:
			throw new Error(`unknown coverage case ${caseName}`);
	}
}

const view = step =>
	step === undefined
		? undefined
		: {
				status: step.status,
				error: step.error ? String(step.error).slice(0, 800) : undefined,
				response: step.io?.outputs?.response?.text?.slice(0, 200),
				stdout: step.io?.stdout?.text?.slice(0, 300),
				stderr: step.io?.stderr?.text?.slice(0, 500),
				sessionId: step.meta?.session_id,
				provider: step.meta?.provider,
				model: step.meta?.model,
				usd: step.meta?.cost?.usd,
				durationMs: step.attemptLog?.at(-1)?.durationMs,
			};

async function runCase(variant, caseName) {
	const env = new BenchEnv({ variant });
	const out = { variant, case: caseName };
	try {
		await env.prepare();
		await env.startDaemon();
		const yaml = caseFlow(variant, caseName);
		const flowPath = env.writeFlow('bench-cov', yaml);
		const started = Date.now();
		const run = await env.run(flowPath);
		const done =
			caseName === 'mcp'
				? record => ['completed', 'failed', 'cancelled'].includes(record.steps?.['from-model']?.status) || ['failed', 'cancelled'].includes(record.status) || record.status === 'completed'
				: record => ['completed', 'failed', 'cancelled'].includes(record.status);
		let record;
		try {
			record = await env.waitRecord(run.executionId, done, CUT_MS, 'the case to settle');
			out.settled = true;
		} catch (error) {
			out.settled = false;
			out.settleNote = error.message;
			record = env.record(run.executionId);
		}
		out.msToSettleOrCut = Date.now() - started;
		out.runStatus = record?.status;
		out.steps = Object.fromEntries(Object.entries(record?.steps ?? {}).map(([id, step]) => [id, view(step)]));
		if (caseName === 'mcp') {
			const injected = record?.steps?.['from-model'];
			const host = (injected?.io?.stdout?.text ?? '').trim().split(/\s+/)[0] || undefined;
			out.injectedRanOn = host;
			out.hostHostname = os.hostname();
			out.injectedRanOnHost = host === undefined ? 'unknown' : host.toLowerCase() === os.hostname().toLowerCase();
		}
		const show = env.flow(['show', run.executionId]);
		out.flowShowText = `${show.stdout}${show.stderr}`.slice(0, 2000);
		const daemonText = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8') : '';
		out.daemonLogLines = daemonText
			.split('\n')
			.filter(line => /error|fail|refus|cannot|not supported|unsupported|ENOENT|ERR_/i.test(line))
			.filter(line => !/DeprecationWarning|trace-deprecation|ssh-agent|network-mode|git|ProjectScope|project add|detects a project|NoProjectInScope/i.test(line))
			.slice(0, 12)
			.map(line => line.slice(0, 300));
		out.wrapperLogLines = env
			.allWrapperText()
			.split('\n')
			.filter(line => / (warn|error):/.test(line) && !/ssh-agent|network-mode|outside the sandbox mounts/.test(line))
			.slice(0, 12)
			.map(line => line.slice(0, 300));
		out.sbxLs = sbxLsText();
		out.wrapperLogTail = env.allWrapperText().split(/\r?\n/).filter(Boolean).slice(-25).map(line => line.slice(0, 300));
	} catch (error) {
		out.error = error.message;
		out.daemonTail = fs.existsSync(env.daemonLog) ? fs.readFileSync(env.daemonLog, 'utf8').slice(-1500) : '';
	} finally {
		out.cleanupNotes = await env.cleanup();
	}
	return out;
}

export async function runCoverage({ variants }) {
	const results = [];
	const plan = {
		host: ['cmdShell', 'mcp', 'resume'],
		relay: ['codex', 'opencode', 'cmdShell', 'mcp', 'resume'],
		exec: ['codex', 'opencode', 'cmdShell', 'mcp', 'resume'],
	};
	for (const variant of variants) {
		for (const caseName of plan[variant]) {
			if (process.env.BENCH_CASES && !process.env.BENCH_CASES.split(',').includes(`${variant}:${caseName}`)) continue;
			console.log(`--- coverage ${variant} / ${caseName}`);
			const result = await runCase(variant, caseName);
			console.log(`    run=${result.runStatus} settled=${result.settled} ${result.error ? 'ERROR ' + result.error : ''}`);
			results.push(result);
			saveJson(process.env.BENCH_COV_FILE ?? 'coverage-results.json', results);
		}
	}
	return results;
}

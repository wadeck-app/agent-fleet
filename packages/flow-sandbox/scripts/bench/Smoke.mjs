// Exploration helper of the M8 bench: one tiny run of one variant, prints what the daemon recorded.
// SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/bench/Smoke.mjs <host|relay|exec>
import fs from 'node:fs';
import { BenchEnv, flowHeader, modelStep, parseWrapperTimings, requireLive, saveJson, scriptStep, stepFacts } from './BenchLib.mjs';

requireLive();
const variant = process.argv[2] ?? 'host';
const env = new BenchEnv({ variant });
let notes = [];
try {
	await env.prepare();
	await env.startDaemon();
	const yaml =
		flowHeader({ id: 'smoke', labelled: variant !== 'host' }) +
		scriptStep({ id: 's1' }) +
		scriptStep({ id: 's2', depends: 's1' }) +
		modelStep({ id: 'ask', depends: 's2', prompt: 'Reply with the single word OK and nothing else.' });
	const flowPath = env.writeFlow('smoke', yaml);
	const t0 = Date.now();
	const run = await env.run(flowPath);
	const record = await env.waitSettled(run.executionId);
	console.log('total ms', Date.now() - t0, 'accept ms', run.acceptedAt - run.issuedAt);
	console.log('record keys', Object.keys(record), record.status);
	console.log({ createdAt: record.createdAt, startedAt: record.startedAt, completedAt: record.completedAt });
	for (const id of ['s1', 's2', 'ask']) console.log(stepFacts(record, id));
	console.log(parseWrapperTimings(env.allWrapperText()));
	fs.writeFileSync(saveJson('smoke-' + variant + '.json', { record }).replace('.json', '.log'), env.allWrapperText() + '\n----daemon\n' + fs.readFileSync(env.daemonLog, 'utf8'));
	await env.stopDaemonGracefully();
} finally {
	notes = await env.cleanup();
	console.log(notes);
}

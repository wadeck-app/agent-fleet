/**
 * Scenario 5 of the M8 benchmark (live part): the log lines the daemon stores for the same one-word claude step through
 * host, relay and exec (`<config>/logs/*.ndjson`, lines prefixed `[<executionId>|<stepId>]`), plus the `flow show` text.
 * The record fields themselves are compared offline by FidelityReport.mjs from the series data.
 */
import fs from 'node:fs';
import path from 'node:path';

import { BenchEnv, flowHeader, modelStep, saveJson } from './BenchLib.mjs';

export async function runFidelity({ variants }) {
	const results = [];
	for (const variant of variants) {
		console.log(`--- fidelity logs ${variant}`);
		const env = new BenchEnv({ variant });
		const out = { variant };
		try {
			await env.prepare();
			await env.startDaemon();
			const yaml =
				flowHeader({ id: 'bench-fidelity', labelled: variant !== 'host' }) +
				modelStep({ id: 'ask', prompt: 'Reply with the single word OK and nothing else.' });
			const run = await env.run(env.writeFlow('bench-fidelity', yaml));
			await env.waitSettled(run.executionId, 200_000);
			await new Promise(resolve => setTimeout(resolve, 2500));
			const logsDirectory = path.join(env.configDirectory, 'logs');
			const lines = [];
			for (const file of fs.existsSync(logsDirectory) ? fs.readdirSync(logsDirectory) : []) {
				for (const raw of fs.readFileSync(path.join(logsDirectory, file), 'utf8').split('\n')) {
					if (raw.includes(`[${run.executionId}|`)) {
						try {
							const parsed = JSON.parse(raw);
							lines.push({ prefix: parsed.prefix.replace(run.executionId, '<id>'), level: parsed.level, message: String(parsed.message).slice(0, 200) });
						} catch {
							// not a json line
						}
					}
				}
			}
			out.logLineCount = lines.length;
			out.byStep = lines.reduce((acc, line) => ({ ...acc, [line.prefix]: (acc[line.prefix] ?? 0) + 1 }), {});
			out.lines = lines;
			const show = env.flow(['show', run.executionId]);
			out.flowShow = `${show.stdout}${show.stderr}`.replaceAll(run.executionId, '<id>');
			if (env.daemonAlive()) await env.stopDaemonGracefully();
		} catch (error) {
			out.error = error.message;
		} finally {
			out.cleanupNotes = await env.cleanup();
		}
		results.push(out);
		saveJson('fidelity-logs.json', results);
	}
	return results;
}

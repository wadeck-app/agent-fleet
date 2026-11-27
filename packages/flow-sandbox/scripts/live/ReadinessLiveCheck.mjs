#!/usr/bin/env node

/**
 * GATED live check of the readiness check against the REAL AWS CLI: no sandbox, no model call, no daemon. Never part of `npm test`,
 * `npm run check` or CI.
 *
 * It builds ProfileReadinessCheck with the real AwsCredentialExporter (the command that runs is
 * `aws configure export-credentials --profile <p> --format process`) and asks it four things:
 *   1. a script step (no tool): ready, with no AWS call
 *   2. the tool of a valid profile: ready (duration printed)
 *   3. the same tool again at once: ready from the 15 s cache (duration printed)
 *   4. a profile that does not exist: not ready with reason `aws-credentials-unavailable`
 * It never prints credentials (only the readiness answers, which carry none).
 *
 * Usage (from the repository root):
 *   SBX_LIVE=1 READINESS_PROFILE=<host profile with a valid session> node --import tsx packages/flow-sandbox/scripts/live/ReadinessLiveCheck.mjs
 * Env: SBX_LIVE=1 (required), READINESS_PROFILE (default AWS_PROFILE), READINESS_TOOL (claude|codex|opencode, default claude).
 * Exit code: 0 all checks as expected, 1 a check failed, 2 refused to run.
 */
import { AwsCredentialExporter } from '../../src/AwsCredentialExporter.ts';
import { NodeCommandRunner } from '../../src/NodeCommandRunner.ts';
import { ProfileAliases } from '../../src/ProfileAliases.ts';
import { SystemClock } from '../../src/SystemClock.ts';
import { SystemScheduler } from '../../src/SystemScheduler.ts';
import { ProfileReadinessCheck } from '../../src/exec/ProfileReadinessCheck.ts';

function refuse(message) {
	console.error(`REFUSED: ${message}`);
	process.exit(2);
}

if (process.env.SBX_LIVE !== '1') refuse('set SBX_LIVE=1 (this check calls the real AWS CLI).');
const profile = process.env.READINESS_PROFILE ?? process.env.AWS_PROFILE;
if (!profile) refuse('no profile: set READINESS_PROFILE (a host profile whose SSO session is valid) or AWS_PROFILE.');
const tool = process.env.READINESS_TOOL ?? 'claude';
if (!['claude', 'codex', 'opencode'].includes(tool)) refuse('READINESS_TOOL must be claude, codex or opencode.');
const missing = `no-such-profile-${process.pid}`;

const clock = new SystemClock();
const source = new AwsCredentialExporter({ commandRunner: new NodeCommandRunner() });
const lines = [];
const build = entry =>
	new ProfileReadinessCheck({
		aliases: ProfileAliases.parse([entry]),
		credentialSource: source,
		clock,
		scheduler: new SystemScheduler(),
		log: line => lines.push(line),
	});

let failures = 0;
async function expect(label, run, accept) {
	const started = Date.now();
	let answer;
	try {
		answer = await run();
	} catch (error) {
		answer = { thrown: error instanceof Error ? error.message : String(error) };
	}
	const ms = Date.now() - started;
	const ok = accept(answer);
	if (!ok) failures += 1;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (${ms} ms)  ${JSON.stringify(answer)}`);
}

// One alias named after the tool, as the plugin option declares it: profiles=<tool>=<profile>.
const valid = build(`${tool}=${profile}`);
await expect(
	'script step (no tool): ready, no AWS call',
	() => valid.check({}),
	answer => answer.ready === true
);
await expect(
	`${tool} with the valid profile: ready`,
	() => valid.check({ tool }),
	answer => answer.ready === true
);
await expect(
	`${tool} again: ready from the cache`,
	() => valid.check({ tool }),
	answer => answer.ready === true
);
const absent = build(`${tool}=${missing}`);
await expect(
	`${tool} with a profile that does not exist: not ready`,
	() => absent.check({ tool }),
	answer => answer.ready === false && answer.reason === 'aws-credentials-unavailable'
);
console.log(lines.join('\n'));
console.log(failures === 0 ? 'ALL AS EXPECTED' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

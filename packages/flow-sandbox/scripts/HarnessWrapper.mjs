#!/usr/bin/env node

/**
 * DEVELOPMENT HARNESS (milestone M4), not a product: a standalone relay wrapper that a `built-in:command` worker
 * source starts. It registers with the flow daemon as one worker (labels include `sandbox`), runs each assigned step
 * inside a Docker sandbox (sbx) through the flow worker bundle in /opt/flow, and relays the messages both ways.
 *
 * Declare it once (any registered project; see the README section "M4 harness"):
 *   flow worker source add sbx --provider built-in:command --labels sandbox --cwd <repository root> \
 *     --command node --arg --import --arg tsx --arg packages/flow-sandbox/scripts/HarnessWrapper.mjs \
 *     --arg --project-id --arg <id> --arg --profile --arg claude=<aws profile> --arg --region --arg us-east-1 \
 *     --arg --image --arg flow-sandbox:m4 --arg --pull --arg never
 * and give the steps `labels: [sandbox]`. The daemon sets FLOW_DAEMON_WS_URL, FLOW_WORKER_SOURCE_ID and
 * FLOW_WORKER_TOKEN; everything else is an option (run with a bad option to see the usage).
 *
 * ROUTING IS BY LABELS HERE, WHICH DOES NOT ISOLATE: a step injected by a model (the MCP `provideSteps` tool) carries no
 * labels, so the daemon may run it on a host worker, outside the sandbox. Isolation against injected steps needs a run
 * bound to a worker TYPE: the flow declares `workerType: sandbox` and the source is declared with a plugin ref
 * (`flow worker source add <id> --plugin sandbox.<implementation> --plugins-dir <dir> ...`, the plugin sandbox.exec, built by `npm run bundle --workspace flow-sandbox`;
 * not yet run against a real sandbox). A `built-in:command` source has no worker type, so a bound run would never reach it.
 * (This relay prototype does not check its source at startup; the exec wrapper does.)
 *
 * No run-end events exist yet (plan C2): sandboxes are left STOPPED, never removed. Clean up with
 *   node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs list | remove <name>
 */
import { runHarness } from '../src/harness/HarnessMain.ts';

try {
	await runHarness(process.argv.slice(2), process.env);
} catch (error) {
	console.error(`HarnessWrapper failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}

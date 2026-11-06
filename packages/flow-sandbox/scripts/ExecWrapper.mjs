#!/usr/bin/env node

/**
 * DEVELOPMENT PROTOTYPE (milestone M7), not a product: the EXEC variant of the sandbox worker. A standalone wrapper that
 * a `built-in:command` worker source starts. It registers with the flow daemon as one worker (labels include `sandbox`)
 * and runs each assigned step with a normal flow engine ON THE HOST whose processes (scripts, the claude CLI) run
 * inside the run's Docker sandbox (sbx) through `sbx exec`. The relay variant (HarnessWrapper.mjs) runs the engine
 * in the VM instead.
 *
 * Declared like the relay harness (same options; see the header of HarnessWrapper.mjs and the README, "M7"):
 *   flow worker source add sbx-exec --provider built-in:command --labels sandbox --cwd <repository root> \
 *     --command node --arg --import --arg tsx --arg packages/flow-sandbox/scripts/ExecWrapper.mjs \
 *     --arg --project-id --arg <id> --arg --profile --arg claude=<aws profile> --arg --region --arg us-east-1 \
 *     --arg --image --arg flow-sandbox:m7 --arg --pull --arg never
 * and give the steps `labels: [sandbox]`. The daemon sets FLOW_DAEMON_WS_URL, FLOW_WORKER_SOURCE_ID and
 * FLOW_WORKER_TOKEN; everything else is an option (run with a bad option to see the usage).
 *
 * No run-end events exist yet (plan C2): sandboxes are left STOPPED, never removed. Clean up with
 *   node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs list | remove <name>
 */
import { runExecWrapper } from '../src/exec/ExecMain.ts';

try {
	await runExecWrapper(process.argv.slice(2), process.env);
} catch (error) {
	console.error(`ExecWrapper failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}

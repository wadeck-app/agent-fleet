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
 * ROUTING IS BY LABELS HERE, WHICH DOES NOT ISOLATE: a step injected by a model (the MCP `provideSteps` tool) carries no
 * labels, so the daemon may run it on a host worker, outside the sandbox. Isolation against injected steps needs a run
 * bound to a worker TYPE: the flow declares `workerType: sandbox` and the source is declared with a plugin ref
 * (`flow worker source add <id> --plugin sandbox.<implementation> --plugins-dir <dir> ...`, the plugin sandbox.exec, built by `npm run bundle --workspace flow-sandbox`;
 * not yet run against a real sandbox). A `built-in:command` source has no worker type, so a bound run would never reach it.
 * The wrapper logs a warning at startup when it can see that its source has no plugin ref.
 *
 * The wrapper declares `run-events`: when the daemon says a run is over (`run_end`), the run's sandbox is REMOVED and then
 * acknowledged (README, "Run end"). A sandbox is otherwise left STOPPED (daemon stop, wrapper exit, a removal that failed);
 * list and remove those with
 *   node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs list | remove <name>
 */
import { runExecWrapper } from '../src/exec/ExecMain.ts';

try {
	await runExecWrapper(process.argv.slice(2), process.env);
} catch (error) {
	console.error(`ExecWrapper failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}

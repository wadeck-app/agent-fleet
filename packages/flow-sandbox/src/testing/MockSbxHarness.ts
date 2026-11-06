import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SbxCliRuntime, type SbxCliRuntimeOptions } from '../SbxCliRuntime';

/** One recorded invocation of the mock (a line of calls.jsonl). */
export interface MockSbxCall {
	argv: string[];
	msysNoPathconv: string | null;
	stdin: string;
	/** Content of the `--env-file` at the time of the call (exec only). */
	envFileContent?: string | null;
}

export const MOCK_SBX_PATH = fileURLToPath(new URL('./sbx-mock.mjs', import.meta.url));

/**
 * A mock sbx with its own state directory, plus helpers to run SbxCliRuntime against it through a real
 * child process. Always `dispose()` it (afterEach).
 */
export class MockSbxHarness {
	private readonly roots: string[] = [];
	readonly stateDir: string;

	constructor(private readonly scenario?: string) {
		this.stateDir = this.makeDirectory('flow-sandbox-mock-state-');
	}

	/** Env of the sbx child: the mock state directory and scenario are passed here. */
	env(): NodeJS.ProcessEnv {
		const env: NodeJS.ProcessEnv = { ...process.env, SBX_MOCK_STATE_DIR: this.stateDir };
		delete env['SBX_MOCK_SCENARIO'];
		if (this.scenario !== undefined) env['SBX_MOCK_SCENARIO'] = this.scenario;
		return env;
	}

	runtime(options: SbxCliRuntimeOptions = {}): SbxCliRuntime {
		return new SbxCliRuntime({
			binaryPath: MOCK_SBX_PATH,
			env: this.env(),
			tempDirectory: this.makeDirectory('flow-sandbox-mock-tmp-'),
			...options,
		});
	}

	/** A new empty host directory, removed with the harness. */
	makeDirectory(prefix = 'flow-sandbox-mock-dir-'): string {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
		this.roots.push(directory);
		return directory;
	}

	/**
	 * Every mock invocation so far, in order. Empty when the mock was never reached (for example when the
	 * runtime rejected the request before spawning): a test asserting a call must check the length first.
	 */
	calls(): MockSbxCall[] {
		const file = path.join(this.stateDir, 'calls.jsonl');
		if (!fs.existsSync(file)) return [];
		return fs
			.readFileSync(file, 'utf8')
			.split('\n')
			.filter(line => line !== '')
			.map(line => {
				// violations-suppress: ts/no-unsafe-type-cast the file is written by sbx-mock.mjs in the shape of MockSbxCall
				return JSON.parse(line) as MockSbxCall;
			});
	}

	callsWithVerb(...verb: string[]): MockSbxCall[] {
		return this.calls().filter(call => verb.every((word, index) => call.argv[index] === word));
	}

	/** The mock's simulated sandbox file system for one sandbox. */
	vmPath(sandbox: string, sandboxPath: string): string {
		return path.join(this.stateDir, 'vm', sandbox, sandboxPath);
	}

	state(): {
		sandboxes: Record<string, Record<string, unknown>>;
		rules: Record<string, unknown>[];
		secrets: Record<string, unknown>[];
	} {
		return JSON.parse(fs.readFileSync(path.join(this.stateDir, 'state.json'), 'utf8'));
	}

	dispose(): void {
		for (const root of this.roots) fs.rmSync(root, { recursive: true, force: true });
	}
}

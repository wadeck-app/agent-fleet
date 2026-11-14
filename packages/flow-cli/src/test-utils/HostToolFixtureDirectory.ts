import type { HostTool } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SCRIPTS: Readonly<Record<string, string>> = {
	// Prints what it received: argv, the whole environment and the working directory, as JSON.
	'echo.cjs': `process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd() }));`,
	// Starts a DETACHED grandchild (it survives a plain kill of its parent, even on Windows where a job object would end it) that appends to a heartbeat file, then sleeps forever.
	'sleep.cjs': `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const grandchild = spawn(process.execPath, [path.join(__dirname, 'beat.cjs'), process.argv[2]], { stdio: 'ignore', detached: true, windowsHide: true });
grandchild.unref();
// Optional third argument: a file receiving "<own pid>,<grandchild pid>", so a test can prove both are gone.
if (process.argv[3]) {
	fs.writeFileSync(process.argv[3], process.pid + ',' + grandchild.pid);
}
process.stdout.write('started');
setInterval(() => {}, 1000);
`,
	'beat.cjs': `
const fs = require('node:fs');
setInterval(() => fs.appendFileSync(process.argv[2], 'x'), 100);
// Safety net: a grandchild a failing test leaves behind ends by itself.
setTimeout(() => process.exit(0), 30000);
`,
	// Writes N copies of a character (default 'a'), then exits 0.
	'flood.cjs': `
const total = Number(process.argv[2]);
const char = process.argv[3] || 'a';
process.stdout.write(char.repeat(total));
`,
	'fail.cjs': `
process.stderr.write('boom: something went wrong');
process.stdout.write('partial');
process.exit(3);
`,
	// Prints the names found in its working directory, and the working directory.
	'cwd.cjs': `
const fs = require('node:fs');
process.stdout.write(JSON.stringify({ cwd: process.cwd(), entries: fs.readdirSync('.') }));
`,
	// Writes a file into its working directory, to prove the directory is removed afterwards.
	'scribble.cjs': `
require('node:fs').writeFileSync('scribble.txt', 'x');
process.stdout.write(process.cwd());
`,
	// Sleeps for a while without grandchildren, then exits 0.
	'slow.cjs': `
setTimeout(() => process.stdout.write('done'), Number(process.argv[2]));
`,
};

/** Fixture executables for the host tool tests: small node scripts, run through `process.execPath`, in a temp directory. */
export class HostToolFixtureDirectory {
	readonly directory: string;

	private constructor(directory: string) {
		this.directory = directory;
	}

	static create(): HostToolFixtureDirectory {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-fixture-'));
		for (const [name, source] of Object.entries(SCRIPTS)) {
			fs.writeFileSync(path.join(directory, name), source);
		}
		return new HostToolFixtureDirectory(directory);
	}

	script(name: string): string {
		return path.join(this.directory, name);
	}

	/** A tool that runs `script` through node; `extra` are further argv elements (placeholders included). */
	tool(script: string, extra: string[] = [], overrides: Partial<HostTool> = {}): HostTool {
		return {
			id: 'fixture-tool',
			description: 'Fixture tool.',
			sideEffect: 'read',
			command: [process.execPath, this.script(script), ...extra],
			...overrides,
		};
	}

	remove(): void {
		fs.rmSync(this.directory, { recursive: true, force: true });
	}
}

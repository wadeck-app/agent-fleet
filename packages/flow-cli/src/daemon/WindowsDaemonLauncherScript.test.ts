import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type IsolatedCliEnv, createIsolatedCliEnv } from '../test-utils/IsolatedCliEnv';
import { waitUntil } from '../test-utils/WaitHelpers';
import { buildWindowsDaemonLauncherScript } from './WindowsDaemonLauncherScript';

const SELF_DELETE = 'CreateObject("Scripting.FileSystemObject").DeleteFile WScript.ScriptFullName';

describe('buildWindowsDaemonLauncherScript', () => {
	const script = buildWindowsDaemonLauncherScript({
		nodePath: 'C:\\Program Files\\node "x"\\node.exe',
		bundlePath: 'C:\\bin\\flow.cjs',
		forwardedBundleOverride: null,
		daemonEnv: { PATH: 'C:\\a;C:\\b' },
	});
	const lines = script.split('\r\n');

	it('deletes itself as its LAST line, after the daemon was launched without waiting', () => {
		expect(lines.at(-1)).toBe(SELF_DELETE);
		const runIndex = lines.findIndex(line => line.startsWith('oShell.Run'));
		expect(runIndex).toBeGreaterThan(-1);
		expect(runIndex).toBeLessThan(lines.length - 1);
		expect(lines[runIndex]!.endsWith(', 0, False')).toBe(true);
	});

	it('makes the self-delete best-effort: On Error Resume Next right before it, so a missing file never shows a dialog', () => {
		expect(lines.at(-2)).toBe('On Error Resume Next');
		// Nothing before the launch is silenced: a failing launch must still be reported by wscript.
		const runIndex = lines.findIndex(line => line.startsWith('oShell.Run'));
		expect(lines.indexOf('On Error Resume Next')).toBeGreaterThan(runIndex);
	});

	it('keeps the launch line quoting (doubled quotes inside the quoted node and bundle paths)', () => {
		expect(script).toContain(
			'oShell.Run """C:\\Program Files\\node ""x""\\node.exe"" ""C:\\bin\\flow.cjs""", 0, False'
		);
	});

	it('sets FLOW_DAEMON_MODE and forwards the environment lines before the launch', () => {
		const runIndex = lines.findIndex(line => line.startsWith('oShell.Run'));
		expect(lines).toContain('oShell.Environment("Process")("FLOW_DAEMON_MODE") = "1"');
		expect(lines.indexOf('oShell.Environment("Process")("PATH") = "C:\\a;C:\\b"')).toBeLessThan(runIndex);
	});

	it('forwards the bundle override only when one was accepted', () => {
		const withOverride = buildWindowsDaemonLauncherScript({
			nodePath: 'n',
			bundlePath: 'C:\\b.cjs',
			forwardedBundleOverride: 'C:\\b.cjs',
			daemonEnv: {},
		});
		expect(withOverride).toContain('oShell.Environment("Process")("LAUNCHER_BUNDLE_OVERRIDE") = "C:\\b.cjs"');
		expect(script).not.toContain('LAUNCHER_BUNDLE_OVERRIDE');
	});
});

// cscript only exists on Windows, and so does the VBScript the generator produces: the only legitimate skip.
describe.skipIf(process.platform !== 'win32')('the generated script under a real cscript', () => {
	let dir: string;
	let iso: IsolatedCliEnv;
	beforeEach(() => {
		// The node started by the script's launch line must not see the real machine either.
		iso = createIsolatedCliEnv();
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-vbs-selfdelete-'));
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
		iso.cleanup();
	});

	it('prints nothing when the script file was removed by someone else before its self-delete line ran', async () => {
		const bundle = path.join(dir, 'noop.js');
		fs.writeFileSync(bundle, '');
		const marker = path.join(dir, 'reached.marker');
		const generated = buildWindowsDaemonLauncherScript({
			nodePath: process.execPath,
			bundlePath: bundle,
			forwardedBundleOverride: null,
			daemonEnv: {},
		}).split('\r\n');
		// Before the best-effort guard and the self-delete: announce that the script runs, then leave the test time
		// to remove the file.
		const guardIndex = generated.length - 2;
		const withPause = [
			...generated.slice(0, guardIndex),
			`CreateObject("Scripting.FileSystemObject").CreateTextFile("${marker}").Close`,
			'WScript.Sleep 1500',
			...generated.slice(guardIndex),
		];
		const scriptPath = path.join(dir, 'flow-daemon-run-experiment.vbs');
		fs.writeFileSync(scriptPath, withPause.join('\r\n'));

		const child = spawn('cscript.exe', ['//nologo', scriptPath], { windowsHide: true, env: iso.env });
		let output = '';
		child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
		child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
		const exited = new Promise<number | null>(resolve => child.on('close', resolve));
		try {
			await waitUntil(() => fs.existsSync(marker), {
				timeoutMs: 10_000,
				failureMessage: 'cscript never reached the marker line: the experiment itself is broken',
			});
		} catch (error) {
			child.kill();
			throw error;
		}
		fs.unlinkSync(scriptPath);

		expect(await exited).toBe(0);
		expect(output).toBe('');
	}, 20_000);
});

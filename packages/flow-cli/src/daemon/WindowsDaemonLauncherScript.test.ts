import { describe, expect, it } from 'vitest';

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

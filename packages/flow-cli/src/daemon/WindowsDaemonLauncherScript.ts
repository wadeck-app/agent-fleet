import { buildWindowsDaemonEnvLines } from './WindowsDaemonEnv';

export interface WindowsDaemonLauncherScriptInput {
	nodePath: string;
	bundlePath: string;
	/** A LAUNCHER_BUNDLE_OVERRIDE accepted for this bundle, to hand to the daemon; null when there is none (a foreign one is never forwarded). */
	forwardedBundleOverride: string | null;
	daemonEnv: NodeJS.ProcessEnv;
}

function quote(value: string): string {
	return value.replace(/"/g, '""');
}

/**
 * The VBScript that starts the daemon hidden (windowStyle 0, no wait). Its last line deletes the script itself:
 * wscript has read the whole file before running it, and the launch above is asynchronous, so nothing needs the file
 * afterwards -- without it each daemon start left a file in the temp directory.
 */
export function buildWindowsDaemonLauncherScript(input: WindowsDaemonLauncherScriptInput): string {
	const overrideLines =
		input.forwardedBundleOverride === null
			? []
			: [`oShell.Environment("Process")("LAUNCHER_BUNDLE_OVERRIDE") = "${quote(input.forwardedBundleOverride)}"`];
	return [
		'Dim oShell',
		'Set oShell = CreateObject("WScript.Shell")',
		'oShell.Environment("Process")("FLOW_DAEMON_MODE") = "1"',
		...overrideLines,
		...buildWindowsDaemonEnvLines(input.daemonEnv),
		`oShell.Run """${quote(input.nodePath)}"" ""${quote(input.bundlePath)}""", 0, False`,
		'CreateObject("Scripting.FileSystemObject").DeleteFile WScript.ScriptFullName',
	].join('\r\n');
}

import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get all arguments
const args = process.argv.slice(2);
const env = process.env;

// Read stdin
let stdinData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
	stdinData += chunk;
});

process.stdin.on('end', () => {
	let parsedStdin = null;
	try {
		parsedStdin = JSON.parse(stdinData);
	} catch (e) {
		parsedStdin = stdinData;
	}

	// Extract the command from stdin
	const command = parsedStdin?.tool_input?.command || parsedStdin?.command || '';

	// Patterns for commands that kill ports/processes on Windows
	const killPatterns = [
		// Direct kill commands
		/taskkill/i,
		/Stop-Process/i,
		/kill\s+-\d+/,
		/kill\s+\d+/,
		/pkill/i,
		/killall/i,

		// Service control
		/net\s+stop/i,
		/sc\s+stop/i,
		/sc\.exe\s+stop/i,

		// PowerShell variations
		/spps\s/i,
		/Remove-Process/i,
		/Get-Process.*Stop-Process/i,
		/pwsh.*Stop-Process/i,
		/powershell.*Stop-Process/i,
		/pwsh.*kill/i,
		/powershell.*kill/i,

		// WMIC
		/wmic.*process.*delete/i,
		/wmic.*process.*call\s+terminate/i,

		// Pipeline patterns that end in killing
		/netstat.*findstr.*taskkill/i,
		/netstat.*taskkill/i,
		/Get-NetTCPConnection.*Stop-Process/i,
		/for\s+\/f.*taskkill/i,

		// Node.js/npm based port killers
		/npx\s+kill-port/i,
		/npm\s+.*kill-port/i,
		/node.*kill.*port/i,
		/node.*process\.kill/i,

		// PSTools
		/pskill/i,

		// Script execution that might kill processes
		/cscript.*kill/i,
		/wscript.*kill/i,
	];

	// Patterns for destructive Git commands
	const gitDestructivePatterns = [
		// Git restore (discards changes)
		/git\s+restore/i,

		// Git revert (creates revert commit)
		/git\s+revert/i,

		// Git reset (can lose commits)
		/git\s+reset\s+(--hard|--mixed)/i,

		// Git checkout that restores files (discards changes)
		/git\s+checkout\s+--\s+/i,
		/git\s+checkout\s+\S+\s+--\s+/i,

		// Git clean (removes untracked files)
		/git\s+clean/i,

		// Force operations
		/git\s+push\s+.*--force/i,
		/git\s+push\s+.*-f(?:\s|$)/i,
	];

	// Check if the command matches any kill pattern
	const isKillCommand = killPatterns.some(pattern => pattern.test(command));

	if (isKillCommand) {
		// Ask the user for confirmation before killing processes/ports
		const response = {
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'ask',
				permissionDecisionReason: `KILLING PROCESS/PORT

You are attempting to terminate a process or close a port.

This action will forcefully stop the running process, which may result in:
  • Loss of unsaved data in the terminated application
  • Interrupted connections or services
  • Potential system instability if critical processes are affected

Do you want to allow this action?

Command: ${command}`,
			},
		};

		console.log(JSON.stringify(response));
		process.exit(0);
		return;
	}

	// Check if the command matches any destructive Git pattern
	const isGitDestructiveCommand = gitDestructivePatterns.some(pattern => pattern.test(command));

	if (isGitDestructiveCommand) {
		// Ask the user for confirmation before destructive Git operations
		const response = {
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'ask',
				permissionDecisionReason: `DESTRUCTIVE GIT OPERATION

You are attempting to execute a Git command that will modify or discard changes.

This action may result in:
  • Loss of uncommitted changes in tracked files
  • Removal of untracked files
  • Rewriting of commit history
  • Potential data loss if changes are not backed up

Do you want to allow this action?

Command: ${command}`,
			},
		};

		console.log(JSON.stringify(response));
		process.exit(0);
		return;
	}

	// Allow the command
	const response = {
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: 'allow',
		},
	};
	console.log(JSON.stringify(response));
	process.exit(0);
});

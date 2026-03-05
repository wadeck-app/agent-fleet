import { execSync } from 'child_process';
import { basename, dirname } from 'path';
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

	// ─── Workspace worktree: protect integration and main ───────────────────────
	// A ws* agent is never allowed to put commits on "integration" or "main".
	// Only the main agent-fleet workspace can integrate changes.

	// CLAUDE_PROJECT_DIR may not be set in all contexts; fall back to deriving it
	// from __dirname: .../agent-fleet_ws3/.claude/scripts → two levels up = project root
	const projectDir = env.CLAUDE_PROJECT_DIR || dirname(dirname(__dirname));
	const projectDirName = basename(projectDir.replace(/\\/g, '/'));
	const isWorkspaceWorktree = /_ws\d+$/.test(projectDirName);

	if (isWorkspaceWorktree) {
		const isCommit = /\bgit\s+commit\b/i.test(command);
		const isMerge = /\bgit\s+merge\b/i.test(command) && !/--abort|--continue/.test(command);
		const isPush = /\bgit\s+push\b/i.test(command);

		// Vector 4 — checkout to protected branch (bypass: git checkout integration && git merge ws1)
		// Block unconditionally: ws agents have no reason to checkout integration/main
		// Use (?:[^/\w]|$) instead of \b to avoid false positives on "integration/main" in commit messages
		const isCheckoutToProtected = /git\s+checkout\s+(integration|main)(?:[^/\w]|$)/i.test(command);

		if (isCheckoutToProtected) {
			const response = {
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'deny',
					permissionDecisionReason: `PROTECTED BRANCH — OPERATION FORBIDDEN

Workspace "${projectDirName}" cannot checkout "integration" or "main".
Only the main agent-fleet workspace manages branch integration.

Use the "prepare-merge" skill to prepare your branch, then let the integration agent handle the merge.

Command: ${command}`,
				},
			};
			console.log(JSON.stringify(response));
			process.exit(0);
			return;
		}

		if (isCommit || isMerge || isPush) {
			// Vector 1 — branch check at hook evaluation time
			// Catches the case where the agent already switched to a protected branch in a prior command
			let currentBranch = '';
			try {
				currentBranch = execSync(`git -C "${projectDir}" branch --show-current`, {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore'],
				}).trim();
			} catch {
				// git unavailable — fail safe: let command through (no false positives)
			}
			const isOnProtectedBranch = ['integration', 'main'].includes(currentBranch);

			// Vector 2 — explicit push to protected branch (git push origin integration)
			// Only for push: for merges, the branch in the command is the SOURCE (not target)
			// e.g. "git merge origin/integration" is legitimate (pulling updates into ws branch)
			const pushToProtected = isPush && /\b(integration|main)\b/.test(command);

			// Vector 3 — cross-directory bypass (cd ../agent-fleet && git merge ws1)
			// Detect if the command references the main worktree path (without _ws suffix)
			const mainDirName = projectDirName.replace(/_ws\d+$/, ''); // "agent-fleet"
			const crossDirRegex = new RegExp(`${mainDirName}(?!_ws)`, 'i');
			const referencesMainWorktree = crossDirRegex.test(command);

			if (isOnProtectedBranch || pushToProtected || referencesMainWorktree) {
				const response = {
					hookSpecificOutput: {
						hookEventName: 'PreToolUse',
						permissionDecision: 'deny',
						permissionDecisionReason: `PROTECTED BRANCH — OPERATION FORBIDDEN

Workspace "${projectDirName}" cannot commit, merge into, or push to "integration" or "main".
Only the main agent-fleet workspace manages branch integration.

Use the "prepare-merge" skill to prepare your branch, then let the integration agent handle the merge.

Command: ${command}`,
					},
				};
				console.log(JSON.stringify(response));
				process.exit(0);
				return;
			}
		}
	}
	// ────────────────────────────────────────────────────────────────────────────

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

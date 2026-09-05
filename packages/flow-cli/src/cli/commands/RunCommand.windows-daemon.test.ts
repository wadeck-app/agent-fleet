/**
 * Windows daemon-spawn tests for RunCommand.spawnDaemonBackground().
 *
 * The daemon must escape the calling Job Object (from Claude Code / orchestrator)
 * without using DETACHED_PROCESS (which removes the console handle and forces
 * children to call AllocConsole() → WT visible tabs).
 *
 * Solution: spawn wscript.exe with detached:true (escapes Job Object), then let
 * wscript.exe start node.exe via oShell.Run SW_HIDE. The daemon gets a hidden
 * WT console that workers can inherit.
 *
 * These tests validate the source text of spawnDaemonBackground() on Windows.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// Read the source file directly — the runtime path selection is platform-specific
// and cannot be exercised in a unit test. Inspecting the source is the reliable way
// to guard against accidental regressions (windowsHide removed from wscript spawn,
// wscript replaced with direct node spawn, etc.).
const RUN_COMMAND_SRC = fs.readFileSync(
	path.join(import.meta.dirname, 'RunCommand.ts'),
	'utf8'
);

const FLOW_INDEX_SRC = fs.readFileSync(
	path.join(import.meta.dirname, '../FlowIndex.ts'),
	'utf8'
);

describe('Daemon spawn — Windows wscript.exe approach', () => {
	it('spawnDaemonBackground() uses wscript.exe on Windows (not direct node spawn)', () => {
		// The win32 branch must spawn wscript.exe to escape the Job Object without DETACHED_PROCESS
		expect(RUN_COMMAND_SRC).toContain("spawn('wscript.exe'");
	});

	it('spawnDaemonBackground() writes an oShell.Run VBScript for the daemon', () => {
		expect(RUN_COMMAND_SRC).toContain('oShell.Run');
		expect(RUN_COMMAND_SRC).toContain('FLOW_DAEMON_MODE');
	});

	it('spawnDaemonBackground() uses detached:true on wscript.exe to escape Job Object', () => {
		// wscript.exe itself must be detached so it escapes Claude Code's Job Object.
		// The node daemon started by wscript via oShell.Run is NOT detached — it
		// inherits a hidden WT console from wscript (GUI parent + SW_HIDE).
		const wscriptSpawnBlock = RUN_COMMAND_SRC.slice(
			RUN_COMMAND_SRC.indexOf("spawn('wscript.exe'"),
			RUN_COMMAND_SRC.indexOf("spawn('wscript.exe'") + 300
		);
		expect(wscriptSpawnBlock).toContain('detached: true');
	});

	it('spawnDaemonBackground() deletes stale port file before spawning', () => {
		// Prevents ECONNRESET when a previous daemon's port file lingers
		expect(RUN_COMMAND_SRC).toContain('unlinkSync(portFile)');
	});

	it('flow start (FlowIndex) uses wscript.exe on Windows for daemon spawn', () => {
		expect(FLOW_INDEX_SRC).toContain("spawn('wscript.exe'");
		expect(FLOW_INDEX_SRC).toContain('oShell.Run');
	});

	it('flow start (FlowIndex) does NOT fall back to direct node spawn on Windows', () => {
		// Ensure the win32 branch is present and uses wscript, not a direct spawn
		const win32Block = FLOW_INDEX_SRC.slice(
			FLOW_INDEX_SRC.indexOf("process.platform === 'win32'"),
			FLOW_INDEX_SRC.indexOf("process.platform === 'win32'") + 800
		);
		expect(win32Block).toContain('wscript.exe');
	});
});

describe('Worker spawn — no windowsHide (console inheritance)', () => {
	it('WorkerPool source does not set windowsHide:true in spawnWorker()', () => {
		const workerPoolSrc = fs.readFileSync(
			path.join(import.meta.dirname, '../../daemon/WorkerPool.ts'),
			'utf8'
		);
		// Extract the spawnWorker function body
		const spawnWorkerStart = workerPoolSrc.indexOf('spawnWorker()');
		const spawnCall = workerPoolSrc.slice(spawnWorkerStart, spawnWorkerStart + 600);
		expect(spawnCall).not.toContain('windowsHide: true');
		expect(spawnCall).not.toContain('detached: true');
	});
});

// ---------------------------------------------------------------------------
// Cross-package source inspections for flow-engine spawn flags
// (flow-engine vitest has a systemic tsconfig issue; source inspection here instead)
// ---------------------------------------------------------------------------

const FLOW_ENGINE_ROOT = path.join(import.meta.dirname, '../../../../flow-engine/src');

describe('ScriptExecutor — no windowsHide on main spawn (console inheritance)', () => {
	it('execute() spawn call does NOT contain windowsHide: true', () => {
		const src = fs.readFileSync(path.join(FLOW_ENGINE_ROOT, 'executor/ScriptExecutor.ts'), 'utf8');
		// Extract from the main spawn call (inside execute())
		const spawnIdx = src.indexOf('const child = spawn(scriptToExecute');
		const spawnBlock = src.slice(spawnIdx, spawnIdx + 300);
		expect(spawnBlock).not.toContain('windowsHide: true');
		expect(spawnBlock).not.toContain('detached: true');
	});
});

describe('ClaudeLauncher — no windowsHide on background spawn (console inheritance)', () => {
	it('executeBackground() spawn call does NOT contain windowsHide: true', () => {
		const src = fs.readFileSync(path.join(FLOW_ENGINE_ROOT, 'processing/ClaudeLauncher.ts'), 'utf8');
		// Find the executeBackground spawn (not the interactive one which intentionally has no windowsHide)
		const bgIdx = src.indexOf('executeBackground(');
		const bgBlock = src.slice(bgIdx, bgIdx + 2000);
		// Extract just the spawn call inside executeBackground
		const spawnIdx = bgBlock.indexOf('const claudeProcess = spawn(');
		const spawnBlock = bgBlock.slice(spawnIdx, spawnIdx + 200);
		expect(spawnBlock).not.toContain('windowsHide: true');
		expect(spawnBlock).not.toContain('detached: true');
	});
});

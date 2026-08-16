/**
 * Integration test: verifies the mock Claude produces the same NDJSON structure as real Claude.
 *
 * Run manually: CLAUDE_INTEGRATION=1 npx vitest run StepRunner.model.integration.test
 *
 * This test should be re-run each time Claude Code is updated.
 * The last tested version is stored in .claude/claude-version-tested.json.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCK_PATH = join(__dirname, '../testing/claude-mock.mjs');
const VERSION_FILE = join(__dirname, '../../../../../.claude/claude-version-tested.json');

function runProcess(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ stdout: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...process.env, ...env },
			shell: false,
		});
		let stdout = '';
		child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
		child.on('close', code => resolve({ stdout, exitCode: code ?? 0 }));
		child.on('error', reject);
		if (child.stdin) { child.stdin.write('hello world'); child.stdin.end(); }
	});
}

function parseNdjson(raw: string): Record<string, unknown>[] {
	return raw.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

describe.skipIf(!process.env['CLAUDE_INTEGRATION'])('Claude real vs mock compatibility', () => {
	it('mock produces same top-level event types as real Claude', async () => {
		const prompt = 'Say only: hello';

		// Run mock
		const mockResult = await runProcess('node', [MOCK_PATH, '-p', prompt, '--output-format', 'stream-json']);
		expect(mockResult.exitCode).toBe(0);
		const mockEvents = parseNdjson(mockResult.stdout);
		const mockTypes = mockEvents.map(e => `${e['type']}:${e['subtype'] ?? ''}`);

		// Run real Claude
		let realClaudePath: string;
		try {
			realClaudePath = execSync('where claude', { encoding: 'utf8' }).trim().split('\n')[0].trim();
		} catch {
			throw new Error('Real Claude CLI not found on PATH');
		}

		const realResult = await runProcess(realClaudePath, [
			'--dangerously-skip-permissions',
			'--output-format', 'stream-json',
			'-p',
		]);
		const realEvents = parseNdjson(realResult.stdout);
		const realTypes = realEvents.map(e => `${e['type']}:${e['subtype'] ?? ''}`);

		// Both must have system:init, assistant:, result:success
		expect(mockTypes.some(t => t.startsWith('system:init'))).toBe(true);
		expect(mockTypes.some(t => t.startsWith('assistant:'))).toBe(true);
		expect(mockTypes.some(t => t.startsWith('result:success'))).toBe(true);

		expect(realTypes.some(t => t.startsWith('system:init'))).toBe(true);
		expect(realTypes.some(t => t.startsWith('assistant:'))).toBe(true);
		expect(realTypes.some(t => t.startsWith('result:'))).toBe(true);

		// Result event must have 'result' field in both
		const mockResultEvent = mockEvents.find(e => e['type'] === 'result') as Record<string, unknown>;
		const realResultEvent = realEvents.find(e => e['type'] === 'result') as Record<string, unknown>;
		expect(typeof mockResultEvent['result']).toBe('string');
		expect(typeof realResultEvent['result']).toBe('string');

		// Store tested version
		const version = execSync('claude --version', { encoding: 'utf8' }).trim();
		writeFileSync(VERSION_FILE, JSON.stringify({ testedVersion: version, testedAt: new Date().toISOString().slice(0, 10) }, null, 2));
		console.log(`✓ Mock compatible with Claude ${version}`);
	});

	it('last tested version matches current version (warns if stale)', () => {
		if (!existsSync(VERSION_FILE)) {
			console.warn('No claude-version-tested.json found — run with CLAUDE_INTEGRATION=1 to create it');
			return;
		}
		const stored = JSON.parse(readFileSync(VERSION_FILE, 'utf8')) as { testedVersion: string; testedAt: string };
		let current: string;
		try {
			current = execSync('claude --version', { encoding: 'utf8' }).trim();
		} catch {
			console.warn('Could not determine current Claude version');
			return;
		}
		if (stored.testedVersion !== current) {
			console.warn(`⚠️  Claude version changed: ${stored.testedVersion} → ${current}. Re-run with CLAUDE_INTEGRATION=1.`);
		}
		expect(stored.testedVersion).toBeTruthy();
	});
});

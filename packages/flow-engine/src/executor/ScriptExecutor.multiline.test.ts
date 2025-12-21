/**
 * ScriptExecutor Integration Tests - Multiline Scripts
 *
 * These tests run real scripts without mocking to validate multiline script handling.
 */
import { describe, expect, it } from 'vitest';

import { ScriptExecutor } from './ScriptExecutor.js';

describe('ScriptExecutor - Multiline Scripts (Integration)', () => {
	const executor = new ScriptExecutor();

	// Only run on Windows where multiline handling is special
	const describeWindows = process.platform === 'win32' ? describe : describe.skip;

	describeWindows('Windows multiline scripts', () => {
		it('should execute multiline script with multiple echo commands', async () => {
			const script = `echo Line 1
echo Line 2
echo Line 3`;

			const result = await executor.execute({ script });

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Line 1');
			expect(result.stdout).toContain('Line 2');
			expect(result.stdout).toContain('Line 3');
		});

		it('should execute multiline script with variables', async () => {
			const script = `set /a next=5-1 >nul
echo next=%next%
if %next% GEQ 0 (echo continue=true) else (echo continue=false)`;

			const result = await executor.execute({ script });

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('next=4');
			expect(result.stdout).toContain('continue=true');
		});

		it('should execute multiline script with conditional logic', async () => {
			const script = `set value=10
if %value% GTR 5 (
  echo Value is greater than 5
) else (
  echo Value is 5 or less
)`;

			const result = await executor.execute({ script });

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Value is greater than 5');
		});

		it('should execute multiline script with comments', async () => {
			const script = `REM This is a comment
echo Starting test
REM Another comment
set testvar=success
echo Result: %testvar%`;

			const result = await executor.execute({ script });

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Starting test');
			expect(result.stdout).toContain('Result: success');
		});

		it('should handle multiline script with error', async () => {
			const script = `echo First line
exit /b 1
echo This should not print`;

			const result = await executor.execute({ script });

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toContain('First line');
			expect(result.stdout).not.toContain('This should not print');
		});

		it('should not create temp file for single-line scripts', async () => {
			const script = 'echo Single line';

			const result = await executor.execute({ script });

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Single line');
		});
	});

	// Unix/Linux multiline scripts should work without temp files
	const describeUnix = process.platform !== 'win32' ? describe : describe.skip;

	describeUnix('Unix multiline scripts', () => {
		it('should execute multiline shell script', async () => {
			const script = `echo "Line 1"
echo "Line 2"
echo "Line 3"`;

			const result = await executor.execute({ script });

			expect(result.success).toBe(true);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Line 1');
			expect(result.stdout).toContain('Line 2');
			expect(result.stdout).toContain('Line 3');
		});
	});
});

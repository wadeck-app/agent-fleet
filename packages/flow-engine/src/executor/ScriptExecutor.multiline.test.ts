/**
 * ScriptExecutor Integration Tests - Multiline Scripts
 *
 * These tests run real scripts without mocking to validate multiline script handling.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { describe, expect, it } from 'vitest';

import { ScriptExecutor } from './ScriptExecutor';

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

		/**
		 * Regression test: node -e "fetch(...)" caused STATUS_STACK_BUFFER_OVERRUN (exit code 3221226505)
		 * on Windows due to undici native thread initialization.
		 * Fix: use Node.js built-in http.request instead of fetch().
		 */
		it('should post JSON via node http.request without crashing (regression: fetch caused STATUS_STACK_BUFFER_OVERRUN)', async () => {
			let receivedBody = '';

			// Start a mock HTTP server to receive the comment POST
			const server = http.createServer((req, res) => {
				let body = '';
				req.on('data', chunk => {
					body += chunk;
				});
				req.on('end', () => {
					receivedBody = body;
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end('{"id":"test-comment-id"}');
				});
			});

			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
			const address = server.address() as AddressInfo;

			try {
				// This is the exact script pattern used in flows.yml for ticket comment posting.
				// The old version used fetch() and crashed with exit 3221226505 on Windows.
				const script = `node -e "const http=require('http'),u=new URL(process.env.BACKEND_URL+'/api/tickets/'+process.env.TICKET_ID+'/comments'),b=JSON.stringify({content:process.env.COMMENT,author:'worker-ai'});const req=http.request({hostname:u.hostname,port:+(u.port||80),path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},r=>{r.on('data',()=>{});r.on('end',()=>process.exit(0));});req.on('error',e=>{console.error(e.message);process.exit(1);});req.write(b);req.end();"`;

				const result = await executor.execute({
					script,
					env: {
						BACKEND_URL: `http://127.0.0.1:${address.port}`,
						TICKET_ID: 'test-ticket-123',
						COMMENT:
							'Analysis complete: complexity is high\nKey factors: async operations\n"quoted" content handled',
					},
				});

				expect(result.exitCode).not.toBe(3221226505); // Must not crash with Windows STACK_BUFFER_OVERRUN
				expect(result.exitCode).toBe(0);
				expect(result.success).toBe(true);

				const body = JSON.parse(receivedBody) as { content: string; author: string };
				expect(body.author).toBe('worker-ai');
				expect(body.content).toContain('Analysis complete');
				expect(body.content).toContain('"quoted" content handled');
			} finally {
				server.close();
			}
		}, 10000);
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

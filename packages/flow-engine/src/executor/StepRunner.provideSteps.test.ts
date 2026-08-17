/**
 * The XML processToolCalls hack has been removed. provideSteps is now
 * a real MCP tool exposed via the stdio McpServer in flow-cli.
 * Tests for the real MCP path are in packages/flow-cli/src/worker/McpServer.test.ts.
 */
import { it } from 'vitest';

it('provideSteps is handled via real MCP stdio — see McpServer.test.ts', () => {
	// No-op: the XML hack is gone; real MCP tests live in flow-cli
});

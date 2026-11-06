import { NetworkResourceRule } from '../NetworkResourceRule';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import type { SandboxRuntime } from '../SandboxRuntime';

/**
 * The network rule that lets ONE step's MCP forwarder reach the engine's callback server on the host. The server
 * listens on a random loopback port per model step, so the rule is opened for that port when the process starts and
 * removed when it ends. Always scoped to the sandbox (SandboxRuntime has no global variant), exactly like the bridge
 * rule of the relay variant: `localhost:<port>`, reached from the VM as `host.docker.internal:<port>`.
 */
export class McpCallbackRules {
	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly log: SandboxLog
	) {}

	/** Opens the rule; the returned function removes it (never throws: a failure is logged with the command to run). */
	async open(sandbox: string, port: number): Promise<() => Promise<void>> {
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new SandboxError(
				'invalid-argument',
				`The MCP callback port ${port} gives an invalid rule: not a TCP port between 1 and 65535.`
			);
		}
		const resource = `localhost:${port}`;
		const problem = NetworkResourceRule.problem(resource);
		if (problem !== undefined) {
			throw new SandboxError(
				'invalid-argument',
				`The MCP callback port ${port} gives an invalid rule: ${problem}.`
			);
		}
		await this.runtime.allowNetwork({ sandbox, resources: [resource] });
		this.log.info(`MCP callback rule added: sandbox=${sandbox} resource=${resource}`);
		let closed = false;
		return async () => {
			if (closed) return;
			closed = true;
			try {
				await this.runtime.removeNetwork({ sandbox, resources: [resource] });
				this.log.info(`MCP callback rule removed: sandbox=${sandbox} resource=${resource}`);
			} catch (error) {
				if (error instanceof SandboxError && error.kind === 'not-found') return;
				this.log.warn(
					`Could not remove the MCP callback rule ${resource} of sandbox "${sandbox}": ${error instanceof Error ? error.message : String(error)}. It is scoped to this sandbox and disappears when the sandbox is removed; to remove it now: sbx policy rm network --sandbox ${sandbox} --resource ${resource}`
				);
			}
		};
	}
}

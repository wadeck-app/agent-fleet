import { requireAwsRegion } from './AwsRegion';
import { type ModelTool, requireModelTool } from './ModelTool';
import { NetworkResourceRule } from './NetworkResourceRule';
import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import type { SandboxRuntime } from './SandboxRuntime';

export interface SandboxNetworkRulesRequest {
	sandbox: string;
	/** Port of the HostCredentialEndpoint (allowed on host `localhost`). */
	endpointPort: number;
	/** Port of the bridge, when the sandbox runs the relay variant. */
	bridgePort?: number;
	/** AWS region of the Bedrock calls, for example `us-east-1`. */
	region: string;
	/** The model CLIs that run in the sandbox; each adds its own hosts. */
	tools: readonly string[];
	/** Codex fetches from github.com at first start. Default false: opt in only if a run proves it is needed. */
	codexNeedsGithub?: boolean;
	/** Further `host:port` entries the operator accepts for this sandbox (the `extraAllowedHosts` option). */
	extraAllowedHosts?: readonly string[];
}

/**
 * The network rules one sandbox gets on top of the machine-wide sbx policy. Every rule is created with the
 * sandbox scope (SandboxRuntime has no global variant), and `sbx rm` drops them with the sandbox.
 * A per-sandbox rule can only OPEN hosts: it cannot tighten the machine policy (a deny wins, measured).
 */
export class SandboxNetworkRules {
	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly log: SandboxLog
	) {}

	/** The `host:port` entries for the request, without duplicates. Pure: touches nothing. */
	resourcesFor(request: SandboxNetworkRulesRequest): string[] {
		this.requirePort('endpointPort', request.endpointPort);
		if (request.bridgePort !== undefined) this.requirePort('bridgePort', request.bridgePort);
		requireAwsRegion(request.region);
		if (request.tools.length === 0) {
			throw new SandboxError(
				'invalid-argument',
				'SandboxNetworkRules needs at least one model tool, otherwise the sandbox could not reach any model host.'
			);
		}
		const tools = request.tools.map(tool => requireModelTool(tool));

		const resources = [`localhost:${request.endpointPort}`];
		if (request.bridgePort !== undefined) resources.push(`localhost:${request.bridgePort}`);
		for (const tool of tools) resources.push(...this.modelHosts(tool, request));
		resources.push(...(request.extraAllowedHosts ?? []));

		const unique = [...new Set(resources)];
		for (const resource of unique) {
			const problem = NetworkResourceRule.problem(resource);
			if (problem !== undefined) {
				throw new SandboxError(
					'invalid-argument',
					`Network resource "${resource}" is not valid: ${problem}. Check the extraAllowedHosts option.`
				);
			}
		}
		return unique;
	}

	async apply(request: SandboxNetworkRulesRequest): Promise<readonly string[]> {
		const resources = this.resourcesFor(request);
		await this.runtime.allowNetwork({ sandbox: request.sandbox, resources });
		this.log.info(`network rules added: sandbox=${request.sandbox} resources=${resources.join(',')}`);
		return resources;
	}

	/** Removes the rules `apply` added. Not needed when the sandbox itself is removed. */
	async revoke(request: SandboxNetworkRulesRequest): Promise<void> {
		const resources = this.resourcesFor(request);
		await this.runtime.removeNetwork({ sandbox: request.sandbox, resources });
		this.log.info(`network rules removed: sandbox=${request.sandbox} resources=${resources.join(',')}`);
	}

	private modelHosts(tool: ModelTool, request: SandboxNetworkRulesRequest): string[] {
		const runtimeHost = `bedrock-runtime.${request.region}.amazonaws.com:443`;
		switch (tool) {
			case 'claude':
			case 'opencode':
				return [runtimeHost];
			case 'codex':
				return [
					runtimeHost,
					`bedrock-mantle.${request.region}.api.aws:443`,
					...(request.codexNeedsGithub === true ? ['github.com:443'] : []),
				];
			default:
				throw new SandboxError('invalid-argument', `No model hosts are defined for tool "${String(tool)}".`);
		}
	}

	private requirePort(label: string, port: number): void {
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new SandboxError(
				'invalid-argument',
				`${label} must be a TCP port between 1 and 65535, got ${port}. Start the HostCredentialEndpoint before building rules.`
			);
		}
	}
}

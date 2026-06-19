import { FlowExecutor, FlowRegistry } from 'flow-engine';
import type { FlowExecutionResult } from 'flow-engine/types';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { ThrowInterventionHandler } from './interventions/ThrowInterventionHandler.js';

export interface RunOptions {
	/** Direct YAML file path, or a flow ID to look up in flows.yml */
	flowRef: string;
	/** Optional path to flows.yml (defaults to .agent-fleet/flows.yml in cwd) */
	flowsFile?: string;
	/** Input key=value pairs */
	inputs?: Record<string, string>;
	/** Working directory (defaults to cwd) */
	cwd?: string;
}

export class FlowCliRunner {
	private registry: FlowRegistry;
	private executor: FlowExecutor;

	constructor(projectRoot: string) {
		this.registry = new FlowRegistry(projectRoot);
		this.executor = new FlowExecutor(false, this.registry);
	}

	/**
	 * Load a flow from a direct YAML file path.
	 * The flow is registered in the registry so subflows can reference it.
	 */
	private loadFlowFromFile(filePath: string): string {
		const content = fs.readFileSync(filePath, 'utf-8');
		const raw = yaml.load(content);
		if (!raw || typeof raw !== 'object') {
			throw new Error(`Flow file must contain a valid object: ${filePath}`);
		}
		const flow = raw as Record<string, unknown>;
		if (!flow['id'] || typeof flow['id'] !== 'string') {
			throw new Error(`Flow file must have a string 'id' field: ${filePath}`);
		}
		try {
			this.registry.registerFlow(flow as unknown as Parameters<FlowRegistry['registerFlow']>[0]);
		} catch (err) {
			throw new Error(
				`Invalid flow in ${path.basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
		return flow['id'];
	}

	async run(options: RunOptions): Promise<FlowExecutionResult> {
		const { flowRef, inputs = {}, cwd = process.cwd() } = options;

		// Load project flows from .agent-fleet/flows.yml and flows-custom.yml
		await this.registry.loadProjectFlows();

		// Resolve flow: direct file (relative to cwd) or registry ID
		let flowId: string;
		const resolvedPath = path.isAbsolute(flowRef) ? flowRef : path.resolve(cwd, flowRef);
		if (fs.existsSync(resolvedPath)) {
			flowId = this.loadFlowFromFile(resolvedPath);
		} else {
			flowId = flowRef;
		}

		const flow = this.registry.getFlow(flowId);
		if (!flow) {
			throw new Error(`Flow not found: '${flowId}'. Check the ID or provide a YAML file path.`);
		}

		const taskId = `cli-${Date.now()}`;

		// Use cwd as a manual workspace — no git operations
		const workspace = {
			id: `ws-${taskId}`,
			path: cwd,
			mode: 'manual' as const,
			concurrency: { key: taskId, activeTasks: new Set<string>(), locked: false },
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};

		return this.executor.execute({
			taskId,
			flow,
			workspace,
			inputs,
			interventionHandler: new ThrowInterventionHandler(),
		});
	}
}

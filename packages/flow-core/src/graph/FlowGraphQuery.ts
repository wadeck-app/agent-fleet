import * as fs from 'node:fs';

import { FlowCoreError } from '../errors.js';
import { loadExecutions } from '../history/ExecutionLoader.js';
import { resolveExecution } from '../show/ExecutionDetail.js';
import { FlowDefinitionError, loadFlowDefinition } from './FlowDefinitionLoader.js';
import type { FlowGraphResult, FlowGraphTarget } from './FlowGraph.js';
import { buildFlowGraph } from './FlowGraphBuilder.js';
import { annotateGraph } from './RunGraphAnnotation.js';

/**
 * Resolves a graph request against the executions directory:
 * - `executionId` (or unique prefix): the run's flow file + its step states;
 * - `flowId`: the definition, read from the most recent run of that flow whose file still exists;
 * - `flowFile`: the definition of that file.
 * The graph is annotated (annotateGraph): inputs/outputs and data flow, plus the path of the run when there is one.
 * Throws ExecutionLookupError, FlowDefinitionError or FlowCoreError('invalid-flow-graph'), all with actionable messages.
 */
export function queryFlowGraph(executionsDir: string, target: FlowGraphTarget): FlowGraphResult {
	if ('executionId' in target) {
		const { record } = resolveExecution(executionsDir, target.executionId);
		const flow = loadFlowDefinition(record.flowFile);
		return {
			graph: annotateGraph(buildFlowGraph(flow, record), flow, record),
			flowId: flow.id,
			flowName: flow.name || flow.id,
			flowFile: record.flowFile,
			execution: {
				executionId: record.executionId,
				status: record.status,
				startedAt: record.startedAt,
				completedAt: record.completedAt,
			},
		};
	}
	const flowFile = 'flowFile' in target ? target.flowFile : findFlowFile(executionsDir, target.flowId);
	const flow = loadFlowDefinition(flowFile);
	return {
		graph: annotateGraph(buildFlowGraph(flow), flow),
		flowId: flow.id,
		flowName: flow.name || flow.id,
		flowFile,
	};
}

function findFlowFile(executionsDir: string, flowId: string): string {
	const runs = loadExecutions(executionsDir).filter(execution => execution.flowId === flowId);
	if (runs.length === 0) {
		throw new FlowCoreError(
			`No execution of flow '${flowId}' in ${executionsDir}, so its flow file is unknown. ` +
				'Run the flow once, or ask for the graph of a flow file.',
			'flow-not-found'
		);
	}
	const file = runs.find(run => fs.existsSync(run.flowFile))?.flowFile;
	if (!file) {
		throw new FlowDefinitionError(
			`The flow file of flow '${flowId}' no longer exists (last run used ${runs[0].flowFile}). ` +
				'Restore the file or run the flow again.',
			'flow-file-missing'
		);
	}
	return file;
}

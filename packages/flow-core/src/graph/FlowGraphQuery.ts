import * as fs from 'node:fs';

import { DefinitionSnapshotStore } from '../definitions/DefinitionSnapshotStore.js';
import { FlowCoreError } from '../errors.js';
import { loadExecutions } from '../history/ExecutionLoader.js';
import { resolveExecution } from '../show/ExecutionDetail.js';
import { FlowDefinitionError, loadFlowDefinition, parseFlowDefinition } from './FlowDefinitionLoader.js';
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
export function queryFlowGraph(
	executionsDir: string,
	target: FlowGraphTarget,
	definitionsDir: string
): FlowGraphResult {
	if ('executionId' in target) {
		const { record } = resolveExecution(executionsDir, target.executionId);
		// A run that recorded its definition is drawn from that snapshot: the file may have changed since. Only records
		// written before flow versions existed fall back to the flow file (and its inferred edges).
		const recorded = record.definitionSnapshot;
		const flow =
			recorded === undefined
				? loadFlowDefinition(record.flowFile)
				: parseFlowDefinition(new DefinitionSnapshotStore(definitionsDir).read(recorded), recorded);
		const graph = annotateGraph(buildFlowGraph(flow, record), flow, record);
		return {
			graph,
			flowId: flow.id,
			flowName: flow.name || flow.id,
			flowFile: record.flowFile,
			definition:
				recorded === undefined
					? { source: 'flow-file' }
					: { source: 'recorded', version: record.flowVersion ?? flow.version, snapshot: recorded },
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
		definition: { source: 'flow-file' },
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

import { InvalidQueryError, toExecutionDetail } from 'flow-core';
import type { ExecutionState } from 'flow-core';

import { RunInputReader } from './RunInputReader';

export const COST_REPORT_SCHEMA = 1;

/** One run. The cost fields are ABSENT (never 0, never null) when the run has no known cost. */
export interface RunCostRow {
	executionId: string;
	flowId: string;
	status: string;
	startedAt: string;
	totalCostUsd?: number;
	totalCostComplete?: boolean;
	totalCostEstimated?: true;
	totalCostPricesAsOf?: string;
	inputs: Record<string, string>;
}

export interface FlowCostRow {
	flowId: string;
	runs: number;
	completedRuns: number;
	totalUsd?: number;
	medianUsdPerRun?: number;
	maxUsd?: number;
	/** False when any run is a lower bound or has an unknown cost. */
	totalCostComplete: boolean;
}

export interface InputCostRun {
	executionId: string;
	flowId: string;
	status: string;
	totalCostUsd?: number;
	totalCostComplete?: boolean;
}

export interface InputCostRow {
	value: string;
	runs: InputCostRun[];
	totalUsd?: number;
	totalCostComplete: boolean;
}

interface ReportBase {
	schema: typeof COST_REPORT_SCHEMA;
	/** Oldest price table date among the estimated runs; absent when no run is estimated. */
	pricesAsOf?: string;
	filters: Record<string, unknown>;
}

export type CostReport =
	| (ReportBase & { by: 'run'; rows: RunCostRow[] })
	| (ReportBase & { by: 'flow'; rows: FlowCostRow[] })
	| (ReportBase & { by: `input:${string}`; withoutInput: number; rows: InputCostRow[] });

export type CostGrouping = { kind: 'run' } | { kind: 'flow' } | { kind: 'input'; name: string };

const ACCEPTED_BY = '--by accepts: flow, input:<name> (e.g. input:taskId); omit it for one row per run.';

// Sums of floats (0.1 + 0.2) would print 0.30000000000000004.
function roundUsd(value: number): number {
	return Number(value.toFixed(10));
}

function median(sortedAscending: number[]): number {
	const middle = Math.floor(sortedAscending.length / 2);
	return sortedAscending.length % 2 === 1
		? sortedAscending[middle]!
		: (sortedAscending[middle - 1]! + sortedAscending[middle]!) / 2;
}

/** A group is complete only when every run has a figure and none of them is a lower bound. */
function isComplete(rows: { totalCostUsd?: number; totalCostComplete?: boolean }[]): boolean {
	return rows.every(row => row.totalCostUsd !== undefined && row.totalCostComplete === true);
}

function sumOf(rows: { totalCostUsd?: number }[]): number | undefined {
	const figures = rows.flatMap(row => (row.totalCostUsd === undefined ? [] : [row.totalCostUsd]));
	return figures.length === 0 ? undefined : roundUsd(figures.reduce((a, b) => a + b, 0));
}

/**
 * Turns execution records into the `flow cost` document. Prices are never computed here: every figure comes from the
 * run view of flow-core (toExecutionDetail), the same one `flow show` prints.
 */
export class CostReportBuilder {
	/** @throws InvalidQueryError for a `--by` value that is not `flow` or `input:<name>`. */
	static parseGrouping(by: string | undefined): CostGrouping {
		if (by === undefined || by === 'run') {
			return { kind: 'run' };
		}
		if (by === 'flow') {
			return { kind: 'flow' };
		}
		if (by.startsWith('input:') && by.length > 'input:'.length) {
			return { kind: 'input', name: by.slice('input:'.length) };
		}
		throw new InvalidQueryError(`Invalid --by "${by}". ${ACCEPTED_BY}`);
	}

	static runRow(record: ExecutionState): RunCostRow {
		// filePath and text are display data of flow show: not used here.
		const view = toExecutionDetail({ record, filePath: '' }, '');
		return {
			executionId: record.executionId,
			flowId: record.flowId,
			status: record.status,
			startedAt: record.startedAt,
			...(view.totalCostUsd === undefined ? {} : { totalCostUsd: view.totalCostUsd }),
			...(view.totalCostComplete === undefined ? {} : { totalCostComplete: view.totalCostComplete }),
			...(view.totalCostEstimated === undefined ? {} : { totalCostEstimated: view.totalCostEstimated }),
			...(view.totalCostPricesAsOf === undefined ? {} : { totalCostPricesAsOf: view.totalCostPricesAsOf }),
			inputs: RunInputReader.read(record),
		};
	}

	static build(records: ExecutionState[], grouping: CostGrouping, filters: Record<string, unknown>): CostReport {
		const runs = records.map(record => CostReportBuilder.runRow(record));
		const dates = runs.flatMap(run => (run.totalCostPricesAsOf === undefined ? [] : [run.totalCostPricesAsOf]));
		// ISO dates sort as text.
		const base: ReportBase = {
			schema: COST_REPORT_SCHEMA,
			...(dates.length === 0 ? {} : { pricesAsOf: [...dates].sort()[0]! }),
			filters,
		};
		switch (grouping.kind) {
			case 'run':
				return { ...base, by: 'run', rows: runs };
			case 'flow':
				return { ...base, by: 'flow', rows: CostReportBuilder.byFlow(runs) };
			case 'input': {
				const withInput = runs.filter(run => run.inputs[grouping.name] !== undefined);
				return {
					...base,
					by: `input:${grouping.name}`,
					withoutInput: runs.length - withInput.length,
					rows: CostReportBuilder.byInput(withInput, grouping.name),
				};
			}
		}
	}

	private static byFlow(runs: RunCostRow[]): FlowCostRow[] {
		const groups = new Map<string, RunCostRow[]>();
		for (const run of runs) {
			groups.set(run.flowId, [...(groups.get(run.flowId) ?? []), run]);
		}
		return [...groups.entries()].map(([flowId, group]) => {
			const figures = group.flatMap(run => (run.totalCostUsd === undefined ? [] : [run.totalCostUsd]));
			const sorted = [...figures].sort((a, b) => a - b);
			return {
				flowId,
				runs: group.length,
				completedRuns: group.filter(run => run.status === 'completed').length,
				...(figures.length === 0
					? {}
					: {
							totalUsd: sumOf(group),
							medianUsdPerRun: roundUsd(median(sorted)),
							maxUsd: sorted[sorted.length - 1],
						}),
				totalCostComplete: isComplete(group),
			};
		});
	}

	private static byInput(runs: RunCostRow[], name: string): InputCostRow[] {
		const groups = new Map<string, RunCostRow[]>();
		for (const run of runs) {
			const value = run.inputs[name]!;
			groups.set(value, [...(groups.get(value) ?? []), run]);
		}
		return [...groups.entries()].map(([value, group]) => {
			const total = sumOf(group);
			return {
				value,
				runs: group.map(run => ({
					executionId: run.executionId,
					flowId: run.flowId,
					status: run.status,
					...(run.totalCostUsd === undefined ? {} : { totalCostUsd: run.totalCostUsd }),
					...(run.totalCostComplete === undefined ? {} : { totalCostComplete: run.totalCostComplete }),
				})),
				...(total === undefined ? {} : { totalUsd: total }),
				totalCostComplete: isComplete(group),
			};
		});
	}
}

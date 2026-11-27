import type { CostReport } from './CostReportBuilder';

function usd(value: number | undefined, complete: boolean | undefined, estimated?: boolean): string {
	if (value === undefined) {
		return 'unknown';
	}
	return `${estimated === true ? '~' : ''}$${value.toFixed(4)}${complete === false ? '+' : ''}`;
}

function table(header: string[], lines: string[][]): string {
	const widths = header.map((title, column) => Math.max(title.length, ...lines.map(line => line[column]!.length)));
	return [header, ...lines]
		.map(line =>
			line
				.map((cell, column) => cell.padEnd(widths[column]!))
				.join('  ')
				.trimEnd()
		)
		.join('\n');
}

/** The compact table `flow cost` prints without `--json`: one line per row; `+` marks a lower bound, `~` an estimate. */
export class CostTextRenderer {
	static render(report: CostReport): string {
		if (report.rows.length === 0) {
			return 'No executions match.';
		}
		const note =
			report.pricesAsOf === undefined ? '' : `\nEstimated figures use the price table of ${report.pricesAsOf}.`;
		switch (report.by) {
			case 'run':
				return (
					table(
						['EXECUTION', 'FLOW', 'STATUS', 'STARTED', 'COST'],
						report.rows.map(row => [
							row.executionId,
							row.flowId,
							row.status,
							row.startedAt,
							usd(row.totalCostUsd, row.totalCostComplete, row.totalCostEstimated),
						])
					) + note
				);
			case 'flow':
				return (
					table(
						['FLOW', 'RUNS', 'COMPLETED', 'TOTAL', 'MEDIAN', 'MAX'],
						report.rows.map(row => [
							row.flowId,
							String(row.runs),
							String(row.completedRuns),
							usd(row.totalUsd, row.totalCostComplete),
							usd(row.medianUsdPerRun, row.totalCostComplete),
							usd(row.maxUsd, row.totalCostComplete),
						])
					) + note
				);
			default:
				return (
					table(
						['VALUE', 'RUNS', 'TOTAL'],
						report.rows.map(row => [
							row.value,
							String(row.runs.length),
							usd(row.totalUsd, row.totalCostComplete),
						])
					) +
					`\n${report.withoutInput} run(s) without this input.` +
					note
				);
		}
	}
}

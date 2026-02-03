import * as diff from 'diff';
import * as yaml from 'js-yaml';

import type { FlowDefinition } from '../types/flow-engine.types';

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'modified';

export interface DiffLine {
	type: DiffLineType;
	lineNumber: number;
	originalLineNumber?: number;
	content: string;
	count?: number;
}

export interface DiffSummary {
	additions: number;
	deletions: number;
	modifications: number;
}

/**
 * Compute line-by-line diff between two FlowDefinitions
 */
export function computeFlowDiff(
	original: FlowDefinition | null,
	preview: FlowDefinition | null
): { lines: DiffLine[]; summary: DiffSummary } {
	if (!original || !preview) {
		return { lines: [], summary: { additions: 0, deletions: 0, modifications: 0 } };
	}

	const yamlOriginal = yaml.dump(original, { indent: 2, lineWidth: 120 });
	const yamlPreview = yaml.dump(preview, { indent: 2, lineWidth: 120 });

	const changes = diff.diffLines(yamlOriginal, yamlPreview);

	const lines: DiffLine[] = [];
	let lineNumber = 0;
	let originalLineNumber = 0;
	const summary = { additions: 0, deletions: 0, modifications: 0 };

	for (const change of changes) {
		const count = change.count || 0;

		if (change.added) {
			summary.additions += count;
			change.value
				.split('\n')
				.filter(l => l)
				.forEach(line => {
					lines.push({
						type: 'added',
						lineNumber: ++lineNumber,
						content: line,
					});
				});
		} else if (change.removed) {
			summary.deletions += count;
			change.value
				.split('\n')
				.filter(l => l)
				.forEach(line => {
					lines.push({
						type: 'removed',
						lineNumber: lineNumber,
						originalLineNumber: ++originalLineNumber,
						content: line,
					});
				});
		} else {
			change.value
				.split('\n')
				.filter(l => l)
				.forEach(line => {
					lines.push({
						type: 'unchanged',
						lineNumber: ++lineNumber,
						originalLineNumber: ++originalLineNumber,
						content: line,
					});
				});
		}
	}

	// Detect modifications (adjacent add+remove)
	for (let i = 0; i < lines.length - 1; i++) {
		if (lines[i].type === 'removed' && lines[i + 1].type === 'added') {
			lines[i].type = 'modified';
			lines[i + 1].type = 'modified';
			summary.modifications++;
			summary.additions--;
			summary.deletions--;
		}
	}

	return { lines, summary };
}

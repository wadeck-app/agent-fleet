import * as diff from 'diff';
import * as yaml from 'js-yaml';

import type { FlowDefinition } from '../types/flow-engine.types';

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'modified';

export interface DiffSegment {
	type: 'added' | 'removed' | 'unchanged';
	text: string;
}

export interface DiffLine {
	type: DiffLineType;
	lineNumber: number;
	originalLineNumber?: number;
	content: string;
	count?: number;
	segments?: DiffSegment[]; // For character-level diff in modified lines
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

	// Detect modifications (adjacent add+remove with same YAML key)
	for (let i = 0; i < lines.length - 1; i++) {
		if (lines[i].type === 'removed' && lines[i + 1].type === 'added') {
			// Extract YAML key (before first ':') and indentation level
			const removedKey = lines[i].content.match(/^(\s*)([^:]+):/);
			const addedKey = lines[i + 1].content.match(/^(\s*)([^:]+):/);

			// Only mark as modified if same key and same indentation
			if (
				removedKey &&
				addedKey &&
				removedKey[1] === addedKey[1] && // Same indentation
				removedKey[2].trim() === addedKey[2].trim() // Same key
			) {
				// Compute character-level diff
				const charDiff = diff.diffChars(lines[i].content, lines[i + 1].content);
				const segments: DiffSegment[] = charDiff.map(part => ({
					type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
					text: part.value,
				}));

				// Replace removed line with modified line containing segments
				lines[i].type = 'modified';
				lines[i].segments = segments;

				// Remove the added line (we merged it into the modified line)
				lines.splice(i + 1, 1);

				summary.modifications++;
				summary.additions--;
				summary.deletions--;
			}
		}
	}

	return { lines, summary };
}

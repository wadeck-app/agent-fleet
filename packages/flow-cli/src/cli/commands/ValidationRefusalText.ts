interface RefusedIssue {
	message?: unknown;
	suggestion?: unknown;
	location?: { path?: unknown; stepId?: unknown; field?: unknown };
}

/**
 * The text for a run the daemon refused with `VALIDATION_FAILED`, whose message is the list of issues as JSON: the same
 * shape as `flow validate` prints (message, where, fix). A message that is not that list is returned as it is.
 */
export function formatValidationRefusal(message: string): string {
	let issues: unknown;
	try {
		issues = JSON.parse(message);
	} catch {
		return `Error: ${message}`;
	}
	if (!Array.isArray(issues) || issues.length === 0) {
		return `Error: ${message}`;
	}
	const lines = [
		`[fail] Flow has ${String(issues.length)} error${issues.length > 1 ? 's' : ''} (check it with: flow validate <file>)`,
	];
	for (const issue of issues as RefusedIssue[]) {
		const where = [issue.location?.path, issue.location?.stepId, issue.location?.field].find(
			value => typeof value === 'string' && value !== ''
		);
		lines.push(
			`  - ${typeof issue.message === 'string' ? issue.message : JSON.stringify(issue)}${where === undefined ? '' : ` [${String(where)}]`}`
		);
		if (typeof issue.suggestion === 'string' && issue.suggestion !== '') {
			lines.push(`    Fix: ${issue.suggestion}`);
		}
	}
	return lines.join('\n');
}

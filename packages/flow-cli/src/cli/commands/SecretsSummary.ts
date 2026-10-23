import { SecretUsageAnalyzer } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/types';

/**
 * The "secrets" block of `flow show <flow file>`: every declared secret input, where its value
 * comes from (the kind of reference, not the reference or any value) and which steps receive it.
 * Empty when the flow declares none.
 */
export function renderSecretsSummary(flow: FlowDefinition): string {
	const declarations = new SecretUsageAnalyzer().describe(flow);
	if (declarations.length === 0) {
		return '';
	}
	const lines = [
		'secrets:   values are never shown; in logs and records they appear as [secret:NAME]',
		'           pass at run time: -i NAME=env://VARIABLE (daemon environment) or -i NAME=file://./path',
	];
	for (const declaration of declarations) {
		const source = declaration.sourceKind === 'run-time' ? 'run-time' : `default ${declaration.sourceKind}://`;
		const usedBy = declaration.usedBy.length > 0 ? declaration.usedBy.join(', ') : '(not used by any step)';
		const required = declaration.required ? ', required' : '';
		const description = declaration.description ? `  - ${declaration.description}` : '';
		lines.push(`  ${declaration.name}  [${source}${required}]  used by: ${usedBy}${description}`);
	}
	return lines.join('\n');
}

import type { Command } from 'commander';
import { FlowValidator } from 'flow-engine';
import type { FlowDefinition, ValidationIssue } from 'flow-engine/types';

import { loadYaml } from '../utils/loadYaml.js';

function printIssues(label: string, issues: ValidationIssue[], toStderr = false): void {
	if (issues.length === 0) return;
	const print = toStderr ? console.error : console.log;
	print(`\n${label}:`);
	for (const issue of issues) {
		const location = issue.location?.stepId ? ` [step: ${issue.location.stepId}]` : '';
		const field = issue.location?.field ? `.${issue.location.field}` : '';
		print(`  - ${issue.message}${location}${field}`);
	}
}

export function registerValidateCommand(program: Command): void {
	program
		.command('validate <file>')
		.description('Validate a flow YAML file')
		.action((file: string) => {
			const raw = loadYaml(file);

			const validator = new FlowValidator();
			const result = validator.validate(raw as FlowDefinition);

			const errors = result.issues.filter(i => i.severity === 'error');
			const warnings = result.issues.filter(i => i.severity === 'warning');
			const infos = result.issues.filter(i => i.severity === 'info');

			if (result.valid) {
				console.log(
					`✓ Flow is valid${warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`
				);
			} else {
				console.error(`✗ Flow has ${errors.length} error${errors.length > 1 ? 's' : ''}`);
			}

			printIssues('Errors', errors, true);
			printIssues('Warnings', warnings);
			printIssues('Info', infos);

			if (!result.valid) {
				process.exit(1);
			}
		});
}

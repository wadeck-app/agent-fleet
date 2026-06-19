import type { Command } from 'commander';
import { FlowValidator } from 'flow-engine';
import type { ValidationIssue } from 'flow-engine';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

function printIssues(label: string, issues: ValidationIssue[]): void {
	if (issues.length === 0) return;
	console.log(`\n${label}:`);
	for (const issue of issues) {
		const location = issue.location?.stepId ? ` [step: ${issue.location.stepId}]` : '';
		const field = issue.location?.field ? `.${issue.location.field}` : '';
		console.log(`  - ${issue.message}${location}${field}`);
	}
}

export function registerValidateCommand(program: Command): void {
	program
		.command('validate <file>')
		.description('Validate a flow YAML file')
		.action((file: string) => {
			if (!fs.existsSync(file)) {
				console.error(`File not found: ${file}`);
				process.exit(1);
			}

			let raw: unknown;
			try {
				const content = fs.readFileSync(file, 'utf-8');
				raw = yaml.load(content);
				if (raw === null || raw === undefined) {
					console.error(`File is empty: ${file}`);
					process.exit(1);
				}
			} catch (err) {
				console.error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`);
				process.exit(1);
			}

			const validator = new FlowValidator();
			// FlowValidator.validate expects a FlowDefinition — cast after parse
			const result = validator.validate(raw as Parameters<FlowValidator['validate']>[0]);

			const errors = result.issues.filter(i => i.severity === 'error');
			const warnings = result.issues.filter(i => i.severity === 'warning');
			const infos = result.issues.filter(i => i.severity === 'info');

			if (result.valid) {
				console.log(
					`✓ Flow is valid${warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`
				);
			} else {
				console.log(`✗ Flow has ${errors.length} error${errors.length > 1 ? 's' : ''}`);
			}

			printIssues('Errors', errors);
			printIssues('Warnings', warnings);
			printIssues('Info', infos);

			if (!result.valid) {
				process.exit(1);
			}
		});
}

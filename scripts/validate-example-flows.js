#!/usr/bin/env node
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

const REQUIRED_FIELDS = ['version', 'name', 'description', 'workspace', 'steps'];
const WORKSPACE_FIELDS = ['mode', 'gitStrategy', 'reusePolicy'];
const VALID_MODES = ['isolated', 'shared', 'manual'];
const VALID_GIT_STRATEGIES = ['main-only', 'feature-branch', 'any'];
const VALID_REUSE_POLICIES = ['never', 'if-available', 'always'];

const VALID_TYPES = [
	'string',
	'number',
	'boolean',
	'object',
	'text',
	'url',
	'markdown',
	'integer',
	'percentage',
	'duration',
	'enum',
	'multi-enum',
	'file',
	'folder',
	'date',
	'datetime',
	'regex',
	'array',
	'keyvalue',
	'password',
	'priority',
];

function validateFlow(flowId, flow) {
	const errors = [];
	const warnings = [];

	// Check required top-level fields
	for (const field of REQUIRED_FIELDS) {
		if (!flow[field]) {
			errors.push(`Missing required field: ${field}`);
		}
	}

	// Validate workspace
	if (flow.workspace) {
		if (!VALID_MODES.includes(flow.workspace.mode)) {
			errors.push(`Invalid workspace.mode: ${flow.workspace.mode}`);
		}
		if (!VALID_GIT_STRATEGIES.includes(flow.workspace.gitStrategy)) {
			errors.push(`Invalid workspace.gitStrategy: ${flow.workspace.gitStrategy}`);
		}
		if (!VALID_REUSE_POLICIES.includes(flow.workspace.reusePolicy)) {
			errors.push(`Invalid workspace.reusePolicy: ${flow.workspace.reusePolicy}`);
		}
	}

	// Validate inputs
	if (flow.inputs) {
		for (const [inputName, inputDef] of Object.entries(flow.inputs)) {
			if (typeof inputDef === 'string') {
				// Shorthand format
				if (!VALID_TYPES.includes(inputDef)) {
					errors.push(`Invalid input type for '${inputName}': ${inputDef}`);
				}
			} else if (typeof inputDef === 'object') {
				// Extended format
				if (!inputDef.type) {
					errors.push(`Input '${inputName}' missing type field`);
				} else if (!VALID_TYPES.includes(inputDef.type)) {
					errors.push(`Invalid input type for '${inputName}': ${inputDef.type}`);
				}

				// Validate default value type matches declared type
				// Using EXACT same logic as FlowWorker's SchemaValidator (line 393-410)
				if (inputDef.default !== undefined) {
					const defaultType = typeof inputDef.default;
					const expectedType = inputDef.type === 'object' ? 'object' : inputDef.type;

					// STRICT type comparison (exactly like FlowWorker)
					if (defaultType !== expectedType) {
						warnings.push(
							`Default value type '${defaultType}' for '${inputName}' does not match declared type '${inputDef.type}'`
						);
					}
				}

				// Additional validation: Required with default value (LogicalValidator line 409)
				if (inputDef.required === true && inputDef.default !== undefined) {
					warnings.push(`Input '${inputName}' is marked required but has a default value`);
				}
			}
		}
	}

	// Validate steps
	if (flow.steps && Array.isArray(flow.steps)) {
		if (flow.steps.length === 0) {
			errors.push('Steps array is empty');
		}

		for (let i = 0; i < flow.steps.length; i++) {
			const step = flow.steps[i];
			if (!step.id) {
				errors.push(`Step ${i} missing id`);
			}
			if (!step.type) {
				errors.push(`Step ${i} (${step.id || 'unknown'}) missing type`);
			}
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}

async function main() {
	console.log('🔍 Validating example flows...\n');

	const flowsPath = path.join(process.cwd(), '.agent-fleet', 'flows.yml');

	if (!fs.existsSync(flowsPath)) {
		console.error('❌ Flows file not found:', flowsPath);
		process.exit(1);
	}

	const content = fs.readFileSync(flowsPath, 'utf8');
	const flows = yaml.load(content);

	const allFlowIds = Object.keys(flows);
	const exampleFlowIds = allFlowIds.filter(id => id.startsWith('example-'));

	console.log(`📝 Found ${allFlowIds.length} flows total (${exampleFlowIds.length} example flows)\n`);

	let validCount = 0;
	let invalidCount = 0;
	const flowIdsToValidate = process.argv.includes('--all') ? allFlowIds : exampleFlowIds;

	console.log(`Validating ${flowIdsToValidate.length} flows...\n`);

	for (const flowId of flowIdsToValidate) {
		const flow = flows[flowId];
		const result = validateFlow(flowId, flow);

		if (result.valid) {
			console.log(`  ✅ ${flowId}`);
			validCount++;

			// Show warnings even for valid flows (like FlowWorker does)
			if (result.warnings.length > 0) {
				result.warnings.forEach(warn => {
					console.log(`     WARNING: ${warn}`);
				});
			}
		} else {
			console.log(`  ❌ ${flowId}`);
			invalidCount++;

			result.errors.forEach(err => {
				console.log(`     ERROR: ${err}`);
			});

			result.warnings.forEach(warn => {
				console.log(`     WARNING: ${warn}`);
			});
		}
	}

	console.log(`\n📊 Summary:`);
	console.log(`   Valid: ${validCount}`);
	console.log(`   Invalid: ${invalidCount}`);

	if (invalidCount > 0) {
		console.log('\n❌ Some flows have validation errors');
		console.log('\n⚠️  Note: This script performs basic validation only.');
		console.log('   For complete validation, start the FlowWorker to see full results.');
		process.exit(1);
	} else {
		console.log('\n✅ All flows passed basic validation!');
		console.log('\n⚠️  Note: This script performs basic validation only.');
		console.log('   For complete validation (dependencies, templates, etc.),');
		console.log('   start the FlowWorker to see full validation results.');
		process.exit(0);
	}
}

main().catch(err => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});

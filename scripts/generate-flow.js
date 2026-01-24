#!/usr/bin/env node
/**
 * Flow Generation Script
 *
 * Generates a custom flow from structured requirements.
 * Usage: node scripts/generate-flow.js <requirements-json>
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Import from flow-engine (CommonJS style for script)
async function loadFlowEngine() {
	// Dynamically import ES modules
	const { FlowGenerator } = await import('../packages/flow-engine/dist/generation/FlowGenerator.js');
	return { FlowGenerator };
}

async function main() {
	try {
		// Parse requirements from command line argument
		const requirementsJson = process.argv[2];
		if (!requirementsJson) {
			console.error('Usage: node generate-flow.js <requirements-json>');
			process.exit(1);
		}

		const requirements = JSON.parse(requirementsJson);

		// Validate requirements
		if (!requirements.id || !requirements.name || !requirements.description) {
			console.error('Error: Requirements must include id, name, and description');
			process.exit(1);
		}

		// Set defaults for missing fields
		requirements.inputs = requirements.inputs || [];
		requirements.expectedOutputs = requirements.expectedOutputs || [];
		requirements.patterns = requirements.patterns || [];
		requirements.constraints = requirements.constraints || {};

		// Load flow engine
		const { FlowGenerator } = await loadFlowEngine();
		const generator = new FlowGenerator();

		// Generate flow
		const result = generator.generateFlow(requirements);

		// Convert flow to YAML
		const flowYaml = yaml.stringify({ [result.flow.id]: result.flow });

		// Output results
		const output = {
			success: result.success,
			flowYaml,
			validationErrors: result.validationErrors,
			validationWarnings: result.validationWarnings,
			flow: result.flow,
		};

		console.log(JSON.stringify(output, null, 2));

		// Exit with error code if validation failed
		if (!result.success) {
			process.exit(1);
		}
	} catch (error) {
		console.error('Error generating flow:', error.message);
		console.log(
			JSON.stringify({
				success: false,
				error: error.message,
				flowYaml: '',
				validationErrors: [error.message],
				validationWarnings: [],
			})
		);
		process.exit(1);
	}
}

main();

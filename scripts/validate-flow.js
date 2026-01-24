#!/usr/bin/env node
/**
 * Flow Validation Script
 *
 * Validates a flow definition using the FlowValidator.
 * Usage: node scripts/validate-flow.js <flow-yaml>
 */

const yaml = require('yaml');

// Import from flow-engine (CommonJS style for script)
async function loadFlowEngine() {
	// Dynamically import ES modules
	const { FlowValidator } = await import('../packages/flow-engine/dist/validation/FlowValidator.js');
	return { FlowValidator };
}

async function main() {
	try {
		// Parse flow YAML from command line argument
		const flowYaml = process.argv[2];
		if (!flowYaml) {
			console.error('Usage: node validate-flow.js <flow-yaml>');
			process.exit(1);
		}

		// Parse YAML
		const flowData = yaml.parse(flowYaml);

		// Extract flow definition (handle both single flow and flows object)
		let flow;
		if (flowData.id) {
			// Single flow
			flow = flowData;
		} else {
			// Flows object (extract first flow)
			const flowIds = Object.keys(flowData);
			if (flowIds.length === 0) {
				console.error('Error: No flows found in YAML');
				process.exit(1);
			}
			flow = { ...flowData[flowIds[0]], id: flowIds[0] };
		}

		// Load flow engine
		const { FlowValidator } = await loadFlowEngine();
		const validator = new FlowValidator();

		// Validate flow
		const result = validator.validate(flow);

		// Output results
		const output = {
			isValid: result.valid,
			summary: result.summary,
			errors: result.issues.filter(i => i.severity === 'error').map(formatIssue),
			warnings: result.issues.filter(i => i.severity === 'warning').map(formatIssue),
			info: result.issues.filter(i => i.severity === 'info').map(formatIssue),
		};

		console.log(JSON.stringify(output, null, 2));

		// Exit with error code if validation failed
		if (!result.valid) {
			process.exit(1);
		}
	} catch (error) {
		console.error('Error validating flow:', error.message);
		console.log(
			JSON.stringify({
				isValid: false,
				summary: { errors: 1, warnings: 0, info: 0 },
				errors: [
					{
						code: 'VALIDATION_ERROR',
						message: error.message,
					},
				],
				warnings: [],
				info: [],
			})
		);
		process.exit(1);
	}
}

/**
 * Format a validation issue for output
 */
function formatIssue(issue) {
	return {
		code: issue.code,
		message: issue.message,
		location: issue.location
			? {
					stepId: issue.location.stepId,
					field: issue.location.field,
					path: issue.location.path,
				}
			: undefined,
		suggestion: issue.suggestion,
	};
}

main();

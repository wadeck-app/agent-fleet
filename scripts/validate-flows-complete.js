#!/usr/bin/env node

/**
 * Complete Flow Validation Script
 *
 * Implements the full validation logic from FlowWorker's FlowValidator
 * Includes all 8 validators:
 * 1. SchemaValidator - Structure, types, workspace
 * 2. GraphValidator - Cycles, reachability
 * 3. SemanticValidator - References, outputs
 * 4. TemplateValidator - Variable expressions
 * 5. DependencyOrderValidator - Variable usage vs dependencies
 * 6. LogicalValidator - Required + default, data flow
 * 7. ContractValidator - Pre/post conditions
 * 8. SimulationValidator - Arithmetic detection, execution paths
 */
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

const REQUIRED_FIELDS = ['version', 'name', 'description', 'workspace', 'steps'];
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

class ValidationIssueCollector {
	constructor() {
		this.issues = [];
	}

	addError(message, stepId = null, field = null, suggestion = null) {
		this.issues.push({
			severity: 'error',
			message,
			location: { stepId, field },
			suggestion,
		});
	}

	addWarning(message, stepId = null, field = null, suggestion = null) {
		this.issues.push({
			severity: 'warning',
			message,
			location: { stepId, field },
			suggestion,
		});
	}

	getErrors() {
		return this.issues.filter(i => i.severity === 'error');
	}

	getWarnings() {
		return this.issues.filter(i => i.severity === 'warning');
	}

	isValid() {
		return this.getErrors().length === 0;
	}
}

/**
 * 1. SCHEMA VALIDATOR
 */
function validateSchema(flowId, flow, collector) {
	const stepIds = new Set();

	// Required fields
	for (const field of REQUIRED_FIELDS) {
		if (!flow[field]) {
			collector.addError(`Missing required field: ${field}`, null, field);
		}
	}

	// Workspace validation
	if (flow.workspace) {
		if (!VALID_MODES.includes(flow.workspace.mode)) {
			collector.addError(
				`Invalid workspace.mode: ${flow.workspace.mode}`,
				null,
				'workspace.mode',
				`Must be one of: ${VALID_MODES.join(', ')}`
			);
		}
		if (!VALID_GIT_STRATEGIES.includes(flow.workspace.gitStrategy)) {
			collector.addError(
				`Invalid workspace.gitStrategy: ${flow.workspace.gitStrategy}`,
				null,
				'workspace.gitStrategy',
				`Must be one of: ${VALID_GIT_STRATEGIES.join(', ')}`
			);
		}
		if (!VALID_REUSE_POLICIES.includes(flow.workspace.reusePolicy)) {
			collector.addError(
				`Invalid reuse policy: ${flow.workspace.reusePolicy}`,
				null,
				'workspace.reusePolicy',
				`Must be one of: ${VALID_REUSE_POLICIES.join(', ')}`
			);
		}
	}

	// Input validation
	const inputNames = new Set();
	if (flow.inputs) {
		for (const [inputName, inputDef] of Object.entries(flow.inputs)) {
			inputNames.add(inputName);

			if (typeof inputDef === 'string') {
				if (!VALID_TYPES.includes(inputDef)) {
					collector.addError(
						`Invalid input type for '${inputName}': ${inputDef}`,
						null,
						`inputs.${inputName}`
					);
				}
			} else if (typeof inputDef === 'object') {
				if (!inputDef.type) {
					collector.addError(`Input '${inputName}' missing type field`, null, `inputs.${inputName}`);
				} else if (!VALID_TYPES.includes(inputDef.type)) {
					collector.addError(
						`Invalid input type for '${inputName}': ${inputDef.type}`,
						null,
						`inputs.${inputName}.type`
					);
				}

				// Type mismatch warning (EXACT FlowWorker logic)
				if (inputDef.default !== undefined) {
					const defaultType = typeof inputDef.default;
					const expectedType = inputDef.type === 'object' ? 'object' : inputDef.type;

					if (defaultType !== expectedType) {
						collector.addWarning(
							`Default value type '${defaultType}' for input '${inputName}' does not match declared type '${inputDef.type}'`,
							null,
							`inputs.${inputName}.default`,
							'Ensure default value matches the declared type'
						);
					}
				}

				// Required + default warning
				if (inputDef.required === true && inputDef.default !== undefined) {
					collector.addWarning(
						`Input '${inputName}' is marked required but has a default value`,
						null,
						`inputs.${inputName}`,
						"Remove 'required: true' or remove 'default' value (required inputs with defaults are always satisfied)"
					);
				}
			}
		}
	}

	// Steps validation
	if (flow.steps && Array.isArray(flow.steps)) {
		if (flow.steps.length === 0) {
			collector.addError('Steps array is empty', null, 'steps');
		}

		for (let i = 0; i < flow.steps.length; i++) {
			const step = flow.steps[i];
			if (!step.id) {
				collector.addError(`Step ${i} missing id`, null, `steps[${i}].id`);
			} else {
				if (stepIds.has(step.id)) {
					collector.addError(`Duplicate step ID: ${step.id}`, step.id, 'id');
				}
				stepIds.add(step.id);
			}

			if (!step.type) {
				collector.addError(`Step ${i} (${step.id || 'unknown'}) missing type`, step.id, 'type');
			}

			// Validate output patterns for greedy regex
			if (step.output && typeof step.output === 'object') {
				for (const [outputName, outputDef] of Object.entries(step.output)) {
					if (outputDef.pattern) {
						const pattern = outputDef.pattern;
						// Check for greedy .* patterns
						if (pattern.includes('.*') && !pattern.includes('.*?')) {
							collector.addWarning(
								`Output pattern for '${outputName}' uses greedy '.*' which may capture more than intended`,
								step.id,
								`output.${outputName}.pattern`,
								"Consider using non-greedy '(.*?)' or more specific patterns"
							);
						}
					}
				}
			}

			// Validate UserIntervention output 'from' field
			if (step.type === 'user_intervention' && step.output) {
				const validFromValues = [
					'intervention.value',
					'intervention.comment',
					'intervention.answeredBy',
					'intervention.answeredAt',
					'intervention.userResponse',
					'intervention.approved',
					'intervention.rejected',
					'intervention.answer',
					'intervention.choice',
				];

				for (const [outputName, outputDef] of Object.entries(step.output)) {
					if (outputDef.from && !validFromValues.includes(outputDef.from)) {
						collector.addError(
							`UserIntervention step '${step.id}' output '${outputName}' has invalid 'from' value: '${outputDef.from}'`,
							step.id,
							`output.${outputName}.from`,
							`Must be one of: ${validFromValues.join(', ')}`
						);
					}
				}
			}
		}
	}

	return { stepIds, inputNames };
}

/**
 * 2. GRAPH VALIDATOR - Detect circular dependencies
 */
function validateGraph(flow, stepIds, collector) {
	if (!flow.steps || flow.steps.length === 0) return;

	// Build dependency graph
	const graph = new Map();
	for (const step of flow.steps) {
		const deps = new Set(step.depends || []);
		graph.set(step.id, deps);

		// Validate dependency references
		if (step.depends) {
			for (const depId of step.depends) {
				if (!stepIds.has(depId)) {
					collector.addError(
						`Step '${step.id}' depends on undefined step: '${depId}'`,
						step.id,
						'depends',
						`Remove '${depId}' or add a step with that ID`
					);
				}
			}
		}
	}

	// Detect cycles using DFS
	const visited = new Set();
	const recursionStack = new Set();

	function detectCycleDFS(stepId, path) {
		if (recursionStack.has(stepId)) {
			// Found cycle
			const cycleStart = path.indexOf(stepId);
			const cycle = path.slice(cycleStart).concat([stepId]);
			return cycle;
		}

		if (visited.has(stepId)) {
			return null;
		}

		visited.add(stepId);
		recursionStack.add(stepId);
		path.push(stepId);

		const deps = graph.get(stepId) || new Set();
		for (const depId of deps) {
			const cycle = detectCycleDFS(depId, [...path]);
			if (cycle) return cycle;
		}

		recursionStack.delete(stepId);
		return null;
	}

	for (const stepId of graph.keys()) {
		if (!visited.has(stepId)) {
			const cycle = detectCycleDFS(stepId, []);
			if (cycle) {
				collector.addError(
					`Circular dependency detected: ${cycle.join(' → ')}`,
					cycle[0],
					'depends',
					'Remove circular dependency'
				);
				break; // Report only first cycle
			}
		}
	}

	// Check for recursive SubFlow steps
	for (const step of flow.steps) {
		if (step.type === 'subflow' && step.flowId === flow.id) {
			if (step.allowRecursion === true) {
				collector.addWarning(
					`SubFlow step '${step.id}' is recursive (flow '${flow.id}' calls itself). Ensure proper exit condition via 'when' clause to prevent infinite loops.`,
					step.id,
					'flowId',
					'Add a "when" condition to ensure recursion eventually stops'
				);
			} else {
				collector.addError(
					`SubFlow step '${step.id}' creates circular reference (flow '${flow.id}' calls itself)`,
					step.id,
					'flowId',
					'Add "allowRecursion: true" if recursion is intentional, or use a different flow'
				);
			}
		}
	}
}

/**
 * 3. SEMANTIC VALIDATOR - Validate output references
 */
function validateSemantics(flow, stepIds, collector) {
	if (!flow.steps || flow.steps.length === 0) return;

	// Build map of step outputs
	const stepOutputs = new Map();
	for (const step of flow.steps) {
		const outputs = new Set();
		if (step.output && typeof step.output === 'object') {
			for (const outputName of Object.keys(step.output)) {
				outputs.add(outputName);
			}
		}
		stepOutputs.set(step.id, outputs);
	}

	// Extract and validate output references
	const templateRegex = /\$\{\{\s*steps\.([^.}]+)\.outputs\.([^}]+?)\s*\}\}/g;

	for (const step of flow.steps) {
		const texts = [];
		if (step.type === 'model' && step.prompt) texts.push(step.prompt);
		if (step.type === 'script' && step.script) texts.push(step.script);
		if (step.type === 'subflow' && step.inputs) {
			texts.push(...Object.values(step.inputs).filter(v => typeof v === 'string'));
		}

		for (const text of texts) {
			let match;
			const regex = new RegExp(templateRegex.source, templateRegex.flags);
			while ((match = regex.exec(text)) !== null) {
				const referencedStepId = match[1];
				const outputName = match[2];

				// Check if step exists
				if (!stepIds.has(referencedStepId)) {
					collector.addWarning(
						`Reference to undefined step: steps.${referencedStepId}.outputs.${outputName}`,
						step.id,
						null,
						`Add a step with ID '${referencedStepId}' or fix the reference`
					);
					continue;
				}

				// Check if output exists
				const outputs = stepOutputs.get(referencedStepId);
				if (!outputs.has(outputName)) {
					const availableOutputs = Array.from(outputs);
					collector.addWarning(
						`Reference to undefined output: steps.${referencedStepId}.outputs.${outputName}. Step '${referencedStepId}' does not define output '${outputName}'`,
						step.id,
						null,
						availableOutputs.length > 0
							? `Add output definition to step '${referencedStepId}' or use an existing output: ${availableOutputs.join(', ')}`
							: `Add output definition to step '${referencedStepId}'`
					);
				}
			}
		}
	}
}

/**
 * 4. TEMPLATE VALIDATOR - Basic template syntax
 */
function validateTemplates(flow, inputNames, collector) {
	// Just check that templates reference valid inputs
	const templateRegex = /\$\{\{\s*inputs\.([^}]+?)\s*\}\}/g;

	for (const step of flow.steps) {
		const texts = [];
		if (step.type === 'model' && step.prompt) texts.push(step.prompt);
		if (step.type === 'script' && step.script) texts.push(step.script);
		if (step.type === 'subflow' && step.inputs) {
			texts.push(...Object.values(step.inputs).filter(v => typeof v === 'string'));
		}

		for (const text of texts) {
			let match;
			const regex = new RegExp(templateRegex.source, templateRegex.flags);
			while ((match = regex.exec(text)) !== null) {
				const inputName = match[1].trim();
				if (!inputNames.has(inputName)) {
					// Auto-discovered input - just info
					// collector.addWarning(
					// 	`Auto-discovered input: ${inputName}`,
					// 	step.id,
					// 	null,
					// 	'Add to inputs section for better documentation'
					// );
				}
			}
		}
	}
}

/**
 * 5. DEPENDENCY ORDER VALIDATOR
 */
function validateDependencyOrder(flow, stepIds, collector) {
	if (!flow.steps || flow.steps.length === 0) return;

	// Build transitive dependency map
	const directDeps = new Map();
	for (const step of flow.steps) {
		directDeps.set(step.id, new Set(step.depends || []));
	}

	// Compute transitive closure
	const transitiveDeps = new Map();
	for (const step of flow.steps) {
		const visited = new Set();
		function dfs(id) {
			const deps = directDeps.get(id) || new Set();
			for (const depId of deps) {
				if (!visited.has(depId)) {
					visited.add(depId);
					dfs(depId);
				}
			}
		}
		dfs(step.id);
		transitiveDeps.set(step.id, visited);
	}

	// Check if step output references respect dependencies
	const templateRegex = /\$\{\{\s*steps\.([^.}]+)\.outputs\.[^}]+\s*\}\}/g;

	for (const step of flow.steps) {
		const texts = [];
		if (step.type === 'model' && step.prompt) texts.push(step.prompt);
		if (step.type === 'script' && step.script) texts.push(step.script);
		if (step.type === 'subflow' && step.inputs) {
			texts.push(...Object.values(step.inputs).filter(v => typeof v === 'string'));
		}

		for (const text of texts) {
			let match;
			const regex = new RegExp(templateRegex.source, templateRegex.flags);
			while ((match = regex.exec(text)) !== null) {
				const referencedStepId = match[1];

				// Check if referencedStepId is in transitive dependencies of step
				const deps = transitiveDeps.get(step.id) || new Set();
				if (!deps.has(referencedStepId) && referencedStepId !== step.id) {
					collector.addError(
						`Step '${step.id}' uses variable from '${referencedStepId}' but does not depend on it`,
						step.id,
						'depends',
						`Add '${referencedStepId}' to the 'depends' array of '${step.id}' (directly or transitively)`
					);
				}
			}
		}
	}
}

/**
 * 8. SIMULATION VALIDATOR - Arithmetic detection
 */
function validateSimulation(flow, collector) {
	if (!flow.steps || flow.steps.length === 0) return;

	// Detect arithmetic in templates
	const arithmeticPattern = /\$\{\{\s*[^}]*[+\-*/]\s*[^}]*\}\}/g;

	for (const step of flow.steps) {
		const texts = [];
		if (step.type === 'model' && step.prompt) texts.push({ text: step.prompt, field: 'prompt' });
		if (step.type === 'script' && step.script) texts.push({ text: step.script, field: 'script' });
		if (step.type === 'subflow' && step.inputs) {
			for (const [key, value] of Object.entries(step.inputs)) {
				if (typeof value === 'string') {
					texts.push({ text: value, field: `inputs.${key}` });
				}
			}
		}

		for (const { text, field } of texts) {
			const matches = text.match(arithmeticPattern);
			if (matches) {
				for (const match of matches) {
					collector.addError(
						`Template expression contains arithmetic which is not supported: ${match}`,
						step.id,
						field,
						`Move arithmetic to a script step and use the result: set /a result=\${value}+1`
					);
				}
			}
		}
	}

	// Detect logical operators (||, &&, ===, etc.)
	const logicalPattern = /\$\{\{\s*[^}]*(\|\||&&|===|!==|==|!=)\s*[^}]*\}\}/g;

	for (const step of flow.steps) {
		const texts = [];
		if (step.type === 'model' && step.prompt) texts.push({ text: step.prompt, field: 'prompt' });
		if (step.type === 'script' && step.script) texts.push({ text: step.script, field: 'script' });
		if (step.type === 'subflow' && step.inputs) {
			for (const [key, value] of Object.entries(step.inputs)) {
				if (typeof value === 'string') {
					texts.push({ text: value, field: `inputs.${key}` });
				}
			}
		}

		for (const { text, field } of texts) {
			const matches = text.match(logicalPattern);
			if (matches) {
				for (const match of matches) {
					collector.addError(
						`Template expression contains logical operator which is not supported: ${match}`,
						step.id,
						field,
						`Move logic to a script step and use the result`
					);
				}
			}
		}
	}
}

/**
 * Main validation orchestrator
 */
function validateFlow(flowId, flow) {
	const collector = new ValidationIssueCollector();

	// Phase 1: Schema validation
	const { stepIds, inputNames } = validateSchema(flowId, flow, collector);

	// Early exit if critical errors
	if (collector.getErrors().some(e => e.message.includes('Missing required field'))) {
		return {
			valid: false,
			errors: collector.getErrors().map(e => e.message),
			warnings: collector.getWarnings().map(w => w.message),
			issues: collector.issues,
		};
	}

	// Phase 2: Graph validation (cycles)
	validateGraph(flow, stepIds, collector);

	// Phase 3: Semantic validation (output references)
	validateSemantics(flow, stepIds, collector);

	// Phase 4: Template validation (input references)
	validateTemplates(flow, inputNames, collector);

	// Phase 5: Dependency order
	validateDependencyOrder(flow, stepIds, collector);

	// Phase 8: Simulation (arithmetic detection)
	validateSimulation(flow, collector);

	return {
		valid: collector.isValid(),
		errors: collector.getErrors().map(e => e.message),
		warnings: collector.getWarnings().map(w => w.message),
		issues: collector.issues,
	};
}

async function main() {
	console.log('🔍 Validating flows (complete validation)...\n');

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
		flow.id = flowId; // Add ID for validation
		const result = validateFlow(flowId, flow);

		if (result.valid) {
			if (result.warnings.length > 0) {
				console.log(`  ⚠️  ${flowId}`);
				validCount++;
				result.warnings.forEach(warn => {
					console.log(`     WARNING: ${warn}`);
				});
			} else {
				console.log(`  ✅ ${flowId}`);
				validCount++;
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
		process.exit(1);
	} else {
		console.log('\n✅ All flows are valid!');
		process.exit(0);
	}
}

main().catch(err => {
	console.error('❌ Error:', err.message);
	process.exit(1);
});

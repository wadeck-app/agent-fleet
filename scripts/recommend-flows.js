#!/usr/bin/env node
/**
 * Flow Recommendation Script
 *
 * Recommends existing flows based on idea description.
 * Usage: node scripts/recommend-flows.js <requirements-json>
 */

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('yaml');

// Import from flow-engine (CommonJS style for script)
async function loadFlowEngine() {
	// Dynamically import ES modules
	const { FlowRecommendationEngine } =
		await import('../packages/flow-engine/dist/analysis/FlowRecommendationEngine.js');
	return { FlowRecommendationEngine };
}

async function main() {
	try {
		// Parse requirements from command line argument
		const requirementsJson = process.argv[2];
		if (!requirementsJson) {
			console.error('Usage: node recommend-flows.js <requirements-json>');
			process.exit(1);
		}

		const requirements = JSON.parse(requirementsJson);
		const ideaDescription = requirements.description || requirements.idea || '';

		if (!ideaDescription) {
			console.error('Error: No idea description provided');
			process.exit(1);
		}

		// Load flows from flows.yml
		const flowsPath = path.join(__dirname, '..', '.agent-fleet', 'flows.yml');
		const flowsYaml = fs.readFileSync(flowsPath, 'utf8');
		const flowsData = yaml.parse(flowsYaml);

		// Convert to FlowDefinition array
		const allFlows = Object.entries(flowsData).map(([id, flowDef]) => ({
			...flowDef,
			id,
		}));

		// Load flow engine
		const { FlowRecommendationEngine } = await loadFlowEngine();
		const engine = new FlowRecommendationEngine();

		// Get recommendations
		const recommendations = engine.recommendFlows(ideaDescription, allFlows);

		// Output results as JSON
		const result = {
			success: true,
			recommendations: recommendations.map(rec => ({
				flowId: rec.flow.id,
				flowName: rec.flow.name,
				fitScore: rec.fitScore,
				matchedCapabilities: rec.matchedCapabilities,
				gaps: rec.gaps,
				adaptationSuggestions: rec.adaptationSuggestions,
				reasoning: rec.reasoning,
				flow: rec.flow,
			})),
		};

		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error('Error recommending flows:', error.message);
		console.log(
			JSON.stringify({
				success: false,
				error: error.message,
				recommendations: [],
			})
		);
		process.exit(1);
	}
}

main();

#!/usr/bin/env node
import * as path from 'node:path';

import { FlowRegistry } from '../packages/flow-engine/src/registry/FlowRegistry.js';

async function validateAllFlows() {
	console.log('🔍 Validating all flows...\n');

	const projectRoot = process.cwd();
	const registry = new FlowRegistry(projectRoot);

	try {
		// Load project flows
		await registry.loadProjectFlows();

		const allFlows = registry.getAllFlows();
		console.log(`✅ Loaded ${allFlows.length} flows total\n`);

		// Filter example flows
		const exampleFlows = allFlows.filter(f => f.id.startsWith('example-'));
		console.log(`📝 Found ${exampleFlows.length} example flows:\n`);

		let validCount = 0;
		let invalidCount = 0;

		for (const flow of exampleFlows) {
			const validation = registry.validateFlow(flow.id);

			if (validation.valid) {
				console.log(`  ✅ ${flow.id}: ${flow.name}`);
				validCount++;
			} else {
				console.log(`  ❌ ${flow.id}: ${flow.name}`);
				invalidCount++;

				// Show errors
				validation.issues
					.filter(i => i.severity === 'error')
					.forEach(issue => {
						console.log(`     ERROR: ${issue.message}`);
						if (issue.location) {
							console.log(`            at ${JSON.stringify(issue.location)}`);
						}
					});

				// Show warnings
				const warnings = validation.issues.filter(i => i.severity === 'warning');
				if (warnings.length > 0) {
					warnings.forEach(issue => {
						console.log(`     WARNING: ${issue.message}`);
					});
				}
			}
		}

		console.log(`\n📊 Summary:`);
		console.log(`   Valid: ${validCount}`);
		console.log(`   Invalid: ${invalidCount}`);

		process.exit(invalidCount > 0 ? 1 : 0);
	} catch (error) {
		console.error('❌ Error validating flows:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

validateAllFlows();

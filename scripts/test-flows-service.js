import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simulate FlowsService.getFlowsListFromFile
function getFlowsListFromFile() {
	const flowsFilePath = path.join(process.cwd(), '.agent-fleet', 'flows.yml');

	try {
		console.log('Looking for flows file at:', flowsFilePath);

		if (!fs.existsSync(flowsFilePath)) {
			console.log('❌ Flows file not found!');
			return [];
		}

		console.log('✅ Flows file exists');

		const fileContents = fs.readFileSync(flowsFilePath, 'utf8');
		console.log('File content length:', fileContents.length);

		const flows = yaml.load(fileContents);
		console.log('Parsed YAML, type:', typeof flows);
		console.log('Flow keys:', Object.keys(flows));

		const flowList = [];
		for (const [id, flow] of Object.entries(flows)) {
			if (flow && typeof flow === 'object') {
				flowList.push({
					id,
					name: flow.name || id,
					description: flow.description || '',
					version: flow.version || '1.0.0',
				});
			}
		}

		console.log(`\n✅ Loaded ${flowList.length} flows:`);
		flowList.forEach(f => {
			console.log(`  - ${f.id}: ${f.name} (${f.version})`);
		});

		return flowList;
	} catch (error) {
		console.error('❌ Error loading flows from file:', error.message);
		return [];
	}
}

console.log('Testing FlowsService.getFlowsListFromFile()...\n');
const flows = getFlowsListFromFile();
console.log('\nFinal result:', JSON.stringify(flows, null, 2));

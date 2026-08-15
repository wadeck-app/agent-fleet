import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * Load and parse a YAML file for CLI commands.
 * Handles file-not-found, empty file, and parse errors by printing to stderr and exiting 1.
 * Uses JSON_SCHEMA to prevent unexpected type coercions (Dates, Buffers, etc.).
 */
export function loadYaml(file: string): unknown {
	if (!fs.existsSync(file)) {
		console.error(`File not found: ${file}`);
		process.exit(1);
	}
	try {
		const content = fs.readFileSync(file, 'utf-8');
		const raw = yaml.load(content, { schema: yaml.JSON_SCHEMA });
		if (raw === null || raw === undefined) {
			console.error(`File is empty: ${file}`);
			process.exit(1);
		}
		if (typeof raw !== 'object' || Array.isArray(raw)) {
			console.error(
				`Invalid flow: expected a YAML object, got ${Array.isArray(raw) ? 'array' : typeof raw} in ${file}`
			);
			process.exit(1);
		}
		return raw;
	} catch (err) {
		console.error(`Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}
}

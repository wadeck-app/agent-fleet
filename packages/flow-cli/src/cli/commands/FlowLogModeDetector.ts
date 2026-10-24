import * as yaml from 'js-yaml';
import * as fs from 'node:fs';

/**
 * Whether the flow file has a step with `log: streaming` or `log: polling`, which makes `--wait` poll
 * every 50ms. An unreadable or unparsable file means no fast polling (the daemon reports the real error).
 */
export function hasFastLogMode(flowFile: string): boolean {
	if (!fs.existsSync(flowFile)) {
		return false;
	}
	let flowYaml: { steps?: { log?: string }[] } | null;
	try {
		flowYaml = yaml.load(fs.readFileSync(flowFile, 'utf8'), {
			schema: yaml.JSON_SCHEMA,
		}) as { steps?: { log?: string }[] };
	} catch {
		return false;
	}
	return flowYaml?.steps?.some(s => s.log === 'streaming' || s.log === 'polling') ?? false;
}

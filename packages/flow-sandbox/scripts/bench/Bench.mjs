#!/usr/bin/env node
/**
 * M8 benchmark driver (GATED, never in npm test): relay (M4) vs exec (M7) vs host baseline.
 *   SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/bench/Bench.mjs <scenario> [--variants host,relay,exec] [--reps 5]
 * Scenarios: series | concurrency | fidelity | cancel | failure | coverage   (see the module of each)
 * Raw data goes to .claude/temp/m8/*.json. Free memory is checked before every concurrency level (MIN_FREE_GIB).
 */
import { parseArgs } from 'node:util';

import { requireLive } from './BenchLib.mjs';

requireLive();
const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		variants: { type: 'string', default: 'host,relay,exec' },
		reps: { type: 'string', default: '5' },
		levels: { type: 'string', default: '1,2,3,4' },
	},
});
const scenario = positionals[0];
const variants = values.variants.split(',');
const reps = Number(values.reps);

switch (scenario) {
	case 'series': {
		const { runSeries } = await import('./Series.mjs');
		await runSeries({ variants, reps });
		break;
	}
	case 'concurrency': {
		const { runConcurrency } = await import('./Concurrency.mjs');
		await runConcurrency({ variants, reps, levels: values.levels.split(',').map(Number) });
		break;
	}
	case 'cancel': {
		const { runCancel } = await import('./Cancel.mjs');
		await runCancel({ variants });
		break;
	}
	case 'failure': {
		const { runFailure } = await import('./Failure.mjs');
		await runFailure({ variants });
		break;
	}
	case 'fidelity': {
		const { runFidelity } = await import('./Fidelity.mjs');
		await runFidelity({ variants });
		break;
	}
	case 'coverage': {
		const { runCoverage } = await import('./Coverage.mjs');
		await runCoverage({ variants });
		break;
	}
	default:
		console.error(
			`unknown scenario ${JSON.stringify(scenario)}; expected series | concurrency | fidelity | cancel | failure | coverage`
		);
		process.exit(2);
}

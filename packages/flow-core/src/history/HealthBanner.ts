import { flowHealth } from '../query/FlowIndex.js';
import type { FlowSummary } from './FlowSummaries.js';

/** Badge variants of the banner: failing is red, everything fine green, only-running blue, nothing yet neutral. */
export type HealthBannerVariant = 'danger' | 'info' | 'success' | 'default';

export interface HealthBanner {
	text: string;
	variant: HealthBannerVariant;
}

/** One sentence on the state of the flows, by what the last run of each flow says ({@link flowHealth}). */
export function describeFlowHealth(flows: readonly FlowSummary[]): HealthBanner {
	if (flows.length === 0) {
		return { text: 'No execution yet', variant: 'default' };
	}
	const healths = flows.map(flowHealth);
	const failing = healths.filter(health => health === 'failing').length;
	const running = healths.filter(health => health === 'running').length;
	const healthy = healths.filter(health => health === 'healthy').length;
	const runningSuffix = running > 0 ? `, ${running} running` : '';

	if (failing > 0) {
		return { text: `${failing} ${failing === 1 ? 'flow' : 'flows'} failing${runningSuffix}`, variant: 'danger' };
	}
	if (healthy === 0) {
		return { text: `${running} running`, variant: 'info' };
	}
	return { text: `All healthy${runningSuffix}`, variant: 'success' };
}

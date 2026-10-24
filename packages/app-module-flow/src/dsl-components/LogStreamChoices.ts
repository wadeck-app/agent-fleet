import { useAbExperiments, useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';

import { LOG_STREAM_AB_IDS } from '../commons/LogStreamAbIds.js';
import type { Grouping } from './LogStreamModel.js';

export type Identity = 'plain' | 'badge' | 'tree' | 'stripe';
export type Navigation = 'none' | 'chips' | 'rail';
export type TimeMode = 'absolute' | 'offset' | 'delta';
export type Density = 'comfortable' | 'compact' | 'folded';

export interface LogStreamChoices {
	identity: Identity;
	grouping: Grouping;
	navigation: Navigation;
	time: TimeMode;
	density: Density;
}

/** The reference option of each dimension: what a shell without experiments shows. */
export const LOG_STREAM_DEFAULTS: LogStreamChoices = {
	identity: 'tree',
	grouping: 'flat',
	navigation: 'chips',
	time: 'offset',
	density: 'comfortable',
};

/**
 * The five dimensions of the stream as dock rows of the host's single A/B dock (dsl-ui useAbTest + useRegisterAbTests),
 * so every combination can be tried on the real page. While experiments are off (production shell, no host) the stored
 * choice is ignored and the defaults apply: the other options never reach users.
 */
export function useLogStreamChoices(): LogStreamChoices {
	const enabled = useAbExperiments()?.enabled === true;
	const identity = useAbTest<Identity>({
		id: LOG_STREAM_AB_IDS.identity,
		label: 'Step identity',
		initial: LOG_STREAM_DEFAULTS.identity,
		options: {
			plain: { label: 'Plain', hint: 'The step id as plain text, like the table.' },
			badge: { label: 'Badge', hint: 'Coloured badge with the execution order (#1, #2...) and the step name.' },
			tree: {
				label: 'Tree',
				hint: 'Badge, indented under its parent step for sub-steps, plus a try n/m badge when the step ran several times.',
			},
			stripe: {
				label: 'Stripe',
				hint: 'A coloured stripe on the line and a small #order name, for dense lists.',
			},
		},
	});
	const grouping = useAbTest<Grouping>({
		id: LOG_STREAM_AB_IDS.grouping,
		label: 'Grouping',
		initial: LOG_STREAM_DEFAULTS.grouping,
		options: {
			flat: { label: 'Flat', hint: 'All lines in chronological order, like the table.' },
			step: {
				label: 'By step',
				hint: 'One collapsible section per step, in execution order; the run events come first.',
			},
			attempt: {
				label: 'By attempt',
				hint: 'One collapsible section per attempt of a step, so retries are separated.',
			},
		},
	});
	const navigation = useAbTest<Navigation>({
		id: LOG_STREAM_AB_IDS.navigation,
		label: 'Navigation',
		initial: LOG_STREAM_DEFAULTS.navigation,
		options: {
			none: { label: 'None', hint: 'The step and level selects above are the only navigation.' },
			chips: {
				label: 'Chips',
				hint: 'Sticky strip of step chips with their line counts, plus level chips; a click filters the log.',
			},
			rail: {
				label: 'Rail',
				hint: 'Sticky step index on the left with order, status, line count and a time bar; a click scrolls to the step.',
			},
		},
	});
	const time = useAbTest<TimeMode>({
		id: LOG_STREAM_AB_IDS.time,
		label: 'Time',
		initial: LOG_STREAM_DEFAULTS.time,
		options: {
			absolute: { label: 'Clock', hint: 'Time of day of each line, in your locale.' },
			offset: { label: 'Offset', hint: 'Time since the run started (+12.3s).' },
			delta: { label: 'Delta', hint: 'Time since the previous line of the page (+0.4s).' },
		},
	});
	const density = useAbTest<Density>({
		id: LOG_STREAM_AB_IDS.density,
		label: 'Density',
		initial: LOG_STREAM_DEFAULTS.density,
		options: {
			comfortable: { label: 'Comfortable', hint: 'Level badges and room around each line.' },
			compact: { label: 'Compact', hint: 'Small one-line rows with a short level code.' },
			folded: {
				label: 'Folded',
				hint: 'Compact rows, and runs of 3 or more quiet info lines of one step fold into one row.',
			},
		},
	});
	useRegisterAbTests([identity, grouping, navigation, time, density]);
	if (!enabled) {
		return LOG_STREAM_DEFAULTS;
	}
	return {
		identity: identity.value,
		grouping: grouping.value,
		navigation: navigation.value,
		time: time.value,
		density: density.value,
	};
}

/** Ids of the five independent experiments of the logs page (storage key `ab.<id>`, link `?ab.<id>=<option>`). */
export const LOG_STREAM_AB_IDS = {
	identity: 'flow-logs-identity',
	grouping: 'flow-logs-grouping',
	navigation: 'flow-logs-navigation',
	time: 'flow-logs-time',
	density: 'flow-logs-density',
} as const;

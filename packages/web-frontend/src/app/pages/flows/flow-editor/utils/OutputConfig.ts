import type { OutputVariableConfig } from '../types/flow-engine.types';

/** A subflow step may declare an output as a bare template string; it carries no type, so it reads as a string. */
export function resolveOutputConfig(config: string | OutputVariableConfig): OutputVariableConfig {
	return typeof config === 'string' ? { type: 'string' } : config;
}

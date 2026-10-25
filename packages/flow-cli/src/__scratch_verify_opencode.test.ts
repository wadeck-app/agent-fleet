import * as fs from 'node:fs';
import { describe, it } from 'vitest';

import { FlowConfigLoader } from './config/FlowConfig';

describe('scratch', () => {
	it('prints real resolved opencode config', () => {
		const { config, legacyWarning } = FlowConfigLoader.loadForDaemon('C:/Users/Wadeck/.config/flow');
		console.log('legacyWarning:', legacyWarning);
		console.log('RESOLVED opencode config:', JSON.stringify(config.opencode));
		if (config.opencode.configAnthropic) {
			console.log('existsSync(configAnthropic) RAW:', fs.existsSync(config.opencode.configAnthropic));
		}
		const envTest: Record<string, string | undefined> = {};
		FlowConfigLoader.applyOpenCodeEnvDefaults(config, envTest);
		console.log('OPENCODE_CONFIG_ANTHROPIC after apply:', envTest['OPENCODE_CONFIG_ANTHROPIC']);
		console.log('OPENCODE_CONFIG_OPENAI after apply:', envTest['OPENCODE_CONFIG_OPENAI']);
	});
});

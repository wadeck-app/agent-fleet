/**
 * This config exists so IntelliJ's Playwright plugin can find it when you click
 * the gutter icon on tests in this directory.
 */
import { defineConfig } from '@playwright/test';
import * as path from 'node:path';

import baseConfig from '../playwright.config.storybook';

// Get the project root (3 levels up from this file)
const projectRoot = path.resolve(__dirname, '../..');

// Override the base config to ensure correct working directory
export default defineConfig({
	...baseConfig,
	// Ensure testDir is relative to project root
	//	testDir: path.resolve(projectRoot, 'e2e/test-visual'),
	// Override webServer to use absolute path for command execution
	webServer: baseConfig.webServer
		? {
				...baseConfig.webServer,
				// Ensure command runs from project root where workspaces are defined
				cwd: projectRoot,
			}
		: undefined,
});

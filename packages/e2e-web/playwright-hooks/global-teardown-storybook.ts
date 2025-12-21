/**
 * Global Teardown for Playwright Storybook Tests
 * Cleans up port files created during Storybook test runs
 */
import { unlink } from 'fs/promises';

const debug = false;

async function storybookTeardown() {
	debug && console.log('\n🧹 === CLEANING UP STORYBOOK FILES ===\n');

	try {
		// Use RUN_ID from environment to read the correct port file
		const runId = process.env.RUN_ID || 'default';

		// Clean up storybook port file
		try {
			const filename = `.storybook-port-${runId}.json`;
			await unlink(filename);
			debug && console.log(`🗑️  Cleaned up ${filename}`);
		} catch {
			// File might not exist if Storybook wasn't started
			console.log(`⚠️  No .storybook-port-${runId}.json file to clean up`);
		}

		console.log('\n✅ Storybook cleanup completed\n');
	} catch (error) {
		console.error('❌ Error during Storybook teardown:', error);
		// Don't throw - teardown should always complete
	}
}

export default storybookTeardown;

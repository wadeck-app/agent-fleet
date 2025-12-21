/**
 * Visual Regression Test Generator Configuration
 *
 * This file contains all configuration options for generating visual regression tests.
 * Customize these settings to match your project's needs.
 */
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
	/**
	 * Directories to search for story files
	 * Relative to project root
	 */
	searchDirs: [
		path.join(__dirname, '../packages/frontend/src'),
		// Add more directories if needed
		// path.join(__dirname, '../packages/ui/src'),
	],

	/**
	 * Output file path for generated tests
	 */
	outputFile: path.join(__dirname, '../e2e/test-visual/_all.storybook.visual.ts'),

	/**
	 * Story file patterns to search for
	 */
	storyFilePatterns: [
		'.stories.tsx',
		'.stories.ts',
		// '.stories.jsx',
		// '.stories.js',
	],

	/**
	 * Directories to exclude from search
	 */
	excludeDirs: ['node_modules', '.storybook', 'dist', 'build', 'coverage', '.next', 'out'],

	/**
	 * Stories to exclude by pattern
	 * Use regex patterns to exclude specific stories
	 *
	 * Examples:
	 * - Exclude WIP stories: /WIP|Draft|TODO/i
	 * - Exclude specific component: /LegacyButton/
	 * - Exclude by story name: /Experimental/
	 */
	excludePatterns: [
		// /WIP/i,
		// /Draft/i,
		// /Experimental/i,
	],

	/**
	 * Stories to include by pattern
	 * If empty, includes all stories (except excluded ones)
	 * If specified, ONLY stories matching these patterns will be included
	 *
	 * Examples:
	 * - Only Button and Table: [/Button/, /Table/]
	 * - Only Components folder: [/^Components\//]
	 */
	includePatterns: [
		// /^Components\//,
	],

	/**
	 * Storybook URL
	 * Should match the URL in playwright.config.storybook.ts
	 */
	// storybookUrl: 'http://localhost:6100',
	storybookUrl: 'http://localhost:9999',

	/**
	 * Visual regression screenshot options
	 * These are passed directly to Playwright's toHaveScreenshot()
	 *
	 * Common options:
	 * - maxDiffPixels: Maximum number of pixels allowed to be different (default: 100)
	 * - maxDiffPixelRatio: Maximum ratio of different pixels (0-1)
	 * - threshold: Color difference threshold (0-1, default: 0.2)
	 * - animations: 'disabled' | 'allow' (default: 'disabled')
	 * - scale: 'css' | 'device' (default: 'css')
	 *
	 * See: https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1
	 */
	screenshotOptions: {
		maxDiffPixels: 100,
		// maxDiffPixelRatio: 0.01,
		// threshold: 0.2,
		// animations: 'disabled',
		// scale: 'css',
	},

	/**
	 * Logging options
	 */
	logging: {
		// Show detailed output (useful for debugging)
		verbose: false,

		// Suppress all output (useful for CI/CD)
		silent: false,

		// Show timing information
		showTimings: true,
	},

	/**
	 * Dry-run mode
	 * If true, validates and shows what would be generated without writing the file
	 */
	dryRun: false,

	/**
	 * Custom story parsing function (optional)
	 * Override this if you have non-standard story formats
	 *
	 * @param {string} content - File content
	 * @param {string} filePath - Path to story file
	 * @returns {Array<{name: string, title: string, id: string}>} Array of stories
	 */
	// customParser: (content, filePath) => {
	// 	// Custom parsing logic here
	// 	return [];
	// },

	/**
	 * Custom test template function (optional)
	 * Override this to customize the generated test structure
	 *
	 * @param {Object} story - Story object
	 * @param {string} storybookUrl - Storybook URL
	 * @param {Object} screenshotOptions - Screenshot options
	 * @returns {string} Test code for this story
	 */
	// customTestTemplate: (story, storybookUrl, screenshotOptions) => {
	// 	return `
	// 	test('${story.title} - ${story.name}', async ({ page }) => {
	// 		await page.goto(\`\${storybookUrl}/iframe.html?id=${story.id}\`);
	// 		// Custom test logic here
	// 	});
	// 	`;
	// },
};

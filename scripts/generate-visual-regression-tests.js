/**
 * Production-Ready Visual Regression Test Generator
 *
 * Automatically generates Playwright tests for all Storybook stories.
 * Designed for continuous testing with minimal overhead (<10ms for 50+ stories).
 *
 * Features:
 * - Auto-discovery of all story files
 * - Configurable story filtering (include/exclude patterns)
 * - Error handling and validation
 * - Performance monitoring
 * - Dry-run mode for testing
 * - Silent mode for CI/CD
 *
 * @version 1.0.0
 */
import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

// Load configuration from external file (allows customization without modifying this script)
const configPath = path.join(__dirname, 'visual-regression.config.js');
let CONFIG;

try {
	const configModule = await import('./visual-regression.config.js');
	CONFIG = configModule.default;
} catch (error) {
	console.error(`❌ Failed to load configuration file: ${configPath}`);
	console.error(`   Error: ${error.message}`);
	console.error(`   Using default configuration instead.\n`);

	// Fallback to default configuration
	CONFIG = {
		searchDirs: [path.join(__dirname, '../packages/frontend/src')],
		outputFile: path.join(__dirname, '../e2e/test-visual/_all.storybook.visual.ts'),
		storyFilePatterns: ['.stories.tsx', '.stories.ts'],
		excludeDirs: ['node_modules', '.storybook', 'dist', 'build', 'coverage'],
		excludePatterns: [],
		includePatterns: [],
		storybookUrl: 'http://localhost:6100',
		screenshotOptions: { maxDiffPixels: 100 },
		logging: { verbose: false, silent: false, showTimings: true },
		dryRun: false,
	};
}

// ============================================================================
// Logging Utilities
// ============================================================================

const Logger = {
	error: (msg, ...args) => {
		if (!CONFIG.logging.silent) {
			console.error(`❌ ${msg}`, ...args);
		}
	},

	warn: (msg, ...args) => {
		if (!CONFIG.logging.silent) {
			console.warn(`⚠️  ${msg}`, ...args);
		}
	},

	info: (msg, ...args) => {
		if (!CONFIG.logging.silent) {
			console.log(`ℹ️  ${msg}`, ...args);
		}
	},

	success: (msg, ...args) => {
		if (!CONFIG.logging.silent) {
			console.log(`✅ ${msg}`, ...args);
		}
	},

	verbose: (msg, ...args) => {
		if (CONFIG.logging.verbose && !CONFIG.logging.silent) {
			console.log(`   ${msg}`, ...args);
		}
	},

	timing: (label, duration) => {
		if (CONFIG.logging.showTimings && !CONFIG.logging.silent) {
			console.log(`   ⏱️  ${label}: ${duration.toFixed(2)}ms`);
		}
	},
};

// ============================================================================
// Story File Discovery
// ============================================================================

/**
 * Recursively find all story files in the given directories
 * @returns {string[]} Array of absolute paths to story files
 */
function findStoryFiles() {
	const startTime = performance.now();
	const storyFiles = [];

	function shouldExcludeDir(dirName) {
		return CONFIG.excludeDirs.some(exclude => dirName.includes(exclude));
	}

	function isStoryFile(fileName) {
		return CONFIG.storyFilePatterns.some(pattern => fileName.endsWith(pattern));
	}

	function searchDirectory(dir) {
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				if (entry.isDirectory()) {
					if (!shouldExcludeDir(entry.name)) {
						searchDirectory(fullPath);
					}
				} else if (entry.isFile() && isStoryFile(entry.name)) {
					storyFiles.push(fullPath);
				}
			}
		} catch (error) {
			Logger.error(`Failed to read directory: ${dir}`, error.message);
		}
	}

	for (const searchDir of CONFIG.searchDirs) {
		if (!fs.existsSync(searchDir)) {
			Logger.warn(`Search directory does not exist: ${searchDir}`);
			continue;
		}
		searchDirectory(searchDir);
	}

	const duration = performance.now() - startTime;
	Logger.timing('Story file discovery', duration);
	Logger.verbose(`Found ${storyFiles.length} story files`);

	return storyFiles;
}

// ============================================================================
// Story Parsing
// ============================================================================

/**
 * Extract directory structure from story file path
 * Example: 'frontend/src/components/Button/Button.stories.tsx' -> 'components/Button'
 * @param {string} filePath - Relative file path
 * @returns {string} Directory structure
 */
function extractStoryDirectory(filePath) {
	// Remove frontend/src/ prefix and filename
	const withoutSrc = filePath.replace(/^packages\/frontend\/src\//, '');
	const dirPath = path.dirname(withoutSrc);
	const storyFileName = path.basename(withoutSrc).replace('.stories.tsx', '');
	if (dirPath === '.') {
		return storyFileName;
	} else {
		return dirPath + '/' + storyFileName;
	}
}

/**
 * Parse a story file to extract story metadata
 * @param {string} filePath - Absolute path to story file
 * @returns {Array<{name: string, title: string, id: string, file: string}>}
 */
function parseStoryFile(filePath) {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');

		// Extract the title from meta object
		// Matches: title: 'Components/Button' or title: "Components/Button"
		const titleMatch = content.match(/title:\s*['"`]([^'"`]+)['"`]/);
		if (!titleMatch) {
			Logger.verbose(`No title found in ${path.basename(filePath)}, skipping`);
			return [];
		}
		const title = titleMatch[1];

		// Check if title matches exclude patterns
		if (CONFIG.excludePatterns.some(pattern => pattern.test(title))) {
			Logger.verbose(`Excluding ${title} (matches exclude pattern)`);
			return [];
		}

		// Check if title matches include patterns (if any specified)
		if (CONFIG.includePatterns.length > 0) {
			if (!CONFIG.includePatterns.some(pattern => pattern.test(title))) {
				Logger.verbose(`Excluding ${title} (doesn't match include pattern)`);
				return [];
			}
		}

		// Find all exported story names
		// Matches: export const StoryName: Story = { ... }
		// or: export const StoryName: StoryObj = { ... }
		const storyRegex = /export\s+const\s+(\w+):\s*(?:Story|StoryObj)/g;
		const stories = [];
		let match;

		while ((match = storyRegex.exec(content)) !== null) {
			const storyName = match[1];

			// Skip if story name is 'default' or 'meta'
			if (storyName === 'default' || storyName === 'meta') {
				continue;
			}

			// Skip if the export is commented (check if line starts with //)
			const matchIndex = match.index;
			const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
			const lineBeforeMatch = content.substring(lineStart, matchIndex);
			if (lineBeforeMatch.trim().startsWith('//')) {
				Logger.verbose(`Skipping commented story: ${storyName}`);
				continue;
			}

			// Check if story name matches exclude patterns
			if (CONFIG.excludePatterns.some(pattern => pattern.test(storyName))) {
				Logger.verbose(`Excluding ${title}/${storyName} (matches exclude pattern)`);
				continue;
			}

			// Convert to Storybook ID format
			// Example: 'Components/Button' + 'Primary' => 'components-button--primary'
			const componentId = title.toLowerCase().replace(/\//g, '-');
			// const componentId = title.toLowerCase();
			// Convert story name from PascalCase/camelCase to kebab-case
			// IMPORTANT: Must add dashes BEFORE lowercasing (otherwise capitals are lost)
			// Example: 'LongContent' -> 'Long-Content' -> 'long-content'
			const storySlug = storyName
				.replace(/([A-Z])/g, '-$1') // Add dash before each capital letter
				.toLowerCase() // Convert to lowercase
				.replace(/^-/, ''); // Remove leading dash if any

			const storyId = `${componentId}--${storySlug}`;
			// const storyId = `${componentId}/${storyName.toLowerCase().replace(/([A-Z])/g, '-$1').replace(/^-/, '')}`;

			stories.push({
				name: storyName,
				title,
				id: storyId,
				file: path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/'),
				// Add directory structure
				directory: extractStoryDirectory(
					path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/')
				),
			});
		}

		if (stories.length > 0) {
			Logger.verbose(`${path.basename(filePath)}: ${stories.length} stories`);
		}

		return stories;
	} catch (error) {
		Logger.error(`Failed to parse ${path.basename(filePath)}:`, error.message);
		return [];
	}
}

/**
 * Parse all story files and collect story metadata
 * @param {string[]} storyFiles - Array of story file paths
 * @returns {Array} Array of story objects
 */
function parseAllStories(storyFiles) {
	const startTime = performance.now();
	const allStories = [];

	for (const file of storyFiles) {
		const stories = parseStoryFile(file);
		allStories.push(...stories);
	}

	const duration = performance.now() - startTime;
	Logger.timing('Story parsing', duration);

	return allStories;
}

// ============================================================================
// Test File Generation
// ============================================================================

/**
 * Generate the TypeScript test file content
 * @param {Array} stories - Array of story objects
 * @returns {string} Generated test file content
 */
function generateTestFile(stories) {
	const startTime = performance.now();

	// Sort stories by title and name for consistent output
	const sortedStories = [...stories].sort((a, b) => {
		if (a.title !== b.title) {
			return a.title.localeCompare(b.title);
		}
		return a.name.localeCompare(b.name);
	});

	// Format screenshot options for the template
	const screenshotOptionsStr = JSON.stringify(CONFIG.screenshotOptions)
		.split('\n')
		.map((line, i) => (i === 0 ? line : '\t\t\t' + line))
		.join('\n');

	//FIXME initial attempt, but abandonned. Not working to capture the mobile, wrong resolution.

	// 	const testContent = `// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
	// // Generated by: scripts/generate-visual-regression-tests.js
	// // Generation date: ${new Date().toISOString()}
	// // Total stories: ${sortedStories.length}
	// //
	// // To regenerate: npm run test:visual:generate
	// // Documentation: See scripts/generate-visual-regression-tests.js for configuration
	//
	// import fs from 'fs';
	// import path from 'path';
	// import { test, expect } from '@playwright/test';
	//
	// const STORYBOOK_URL = '${CONFIG.storybookUrl}';
	//
	// test.describe('visual', () => {
	// ${sortedStories.map(story => {
	// 		// Build screenshot path: directory/StoryName.png
	// 		const screenshotPath = story.directory
	// 			? `${story.directory}/${story.name}.png`
	// 			: `${story.name}.png`;
	//
	// 		return `	test('${story.title} - ${story.name}', async ({ page }, { project }) => {
	// 		// Navigate to story
	// 		await page.goto(\`\${STORYBOOK_URL}/iframe.html?id=${story.id}\`);
	//
	// 		// Wait for story to fully render
	// 		await page.waitForLoadState('networkidle');
	//
	// 		// Take screenshot and compare
	// 		let snapshotPath = path.join(__filename + '--snapshots', '${screenshotPath.split('/').join("', '")}');
	// 		snapshotPath = snapshotPath.replace(/\\.png$/, '-' + project.name + '.png');
	//
	// 		if (!fs.existsSync(snapshotPath)) {
	// 			// Capture the screenshot first time
	// 			await page.screenshot({ path: snapshotPath });
	// 		}
	//
	// 		await expect(page).toHaveScreenshot(['${screenshotPath.split('/').join("', '")}'], ${screenshotOptionsStr});
	// 	});
	// `}).join('\n')}});`;

	const testContent = `// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated by: scripts/generate-visual-regression-tests.js
// Total stories: ${sortedStories.length}
//
// To regenerate: npm run test:visual:generate
// Documentation: See scripts/generate-visual-regression-tests.js for configuration

import { test, expect } from '../scripts/hooks-storybook';
import { ensureStoryExists } from '../utils/visualTestHelpers';

test.describe('visual', () => {
${sortedStories
	.map(story => {
		// Build screenshot path: directory/StoryName.png
		const screenshotPath = story.directory ? `${story.directory}/${story.name}.png` : `${story.name}.png`;

		return `	test('${story.title} - ${story.name}', async ({ page }) => {
		// STRICT MODE: Verify story exists BEFORE navigation (fast fail if missing)
		await ensureStoryExists(page, '${story.id}');

		// Navigate to story (relative URL - Playwright resolves with baseURL)
		await page.goto('/iframe.html?id=${story.id}');

		// Wait for story to fully render
		await page.waitForLoadState('networkidle');

		// Take screenshot and compare
		await expect(page).toHaveScreenshot(['${screenshotPath.split('/').join("', '")}'], ${screenshotOptionsStr});
	});
`;
	})
	.join('\n')}});`;

	const duration = performance.now() - startTime;
	Logger.timing('Test file generation', duration);

	return testContent;
}

// ============================================================================
// File Writing
// ============================================================================

/**
 * Write the generated test content to file
 * @param {string} content - Test file content
 * @param {string} outputPath - Output file path
 */
function writeTestFile(content, outputPath) {
	const startTime = performance.now();

	try {
		// Ensure output directory exists
		const outputDir = path.dirname(outputPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
			Logger.verbose(`Created output directory: ${outputDir}`);
		}

		// Write file
		fs.writeFileSync(outputPath, content, 'utf-8');

		const duration = performance.now() - startTime;
		Logger.timing('File writing', duration);
		Logger.success(`Generated test file: ${path.relative(path.join(__dirname, '..'), outputPath)}`);
	} catch (error) {
		Logger.error('Failed to write test file:', error.message);
		throw error;
	}
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate the generated stories
 * @param {Array} stories - Array of story objects
 * @returns {boolean} True if validation passes
 */
function validateStories(stories) {
	if (stories.length === 0) {
		Logger.warn('No stories found! Check your story files and configuration.');
		return false;
	}

	// Check for duplicate story IDs
	const idCounts = {};
	for (const story of stories) {
		idCounts[story.id] = (idCounts[story.id] || 0) + 1;
	}

	const duplicates = Object.entries(idCounts).filter(([_, count]) => count > 1);
	if (duplicates.length > 0) {
		Logger.error('Found duplicate story IDs:');
		duplicates.forEach(([id, count]) => {
			Logger.error(`  - ${id} (${count} times)`);
		});
		return false;
	}

	return true;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Main function to generate visual regression tests
 */
async function main() {
	const totalStartTime = performance.now();

	try {
		// Parse command-line arguments
		const args = process.argv.slice(2);
		if (args.includes('--verbose')) CONFIG.logging.verbose = true;
		if (args.includes('--silent')) CONFIG.logging.silent = true;
		if (args.includes('--dry-run')) CONFIG.dryRun = true;
		if (args.includes('--no-timings')) CONFIG.logging.showTimings = false;

		Logger.info('Visual Regression Test Generator\n');

		// Step 1: Find story files
		Logger.verbose('Finding story files...');
		const storyFiles = findStoryFiles();

		if (storyFiles.length === 0) {
			Logger.error('No story files found! Check your configuration.');
			process.exit(1);
		}

		// Step 2: Parse stories
		Logger.verbose('Parsing stories...');
		const allStories = parseAllStories(storyFiles);

		// Step 3: Validate
		if (!validateStories(allStories)) {
			process.exit(1);
		}

		// Step 4: Generate test file
		Logger.verbose('Generating test file...');
		const testContent = generateTestFile(allStories);

		// Step 5: Write to disk (unless dry-run)
		if (CONFIG.dryRun) {
			Logger.info(`DRY RUN: Would generate ${allStories.length} tests (${testContent.length} chars)`);
		} else {
			writeTestFile(testContent, CONFIG.outputFile);
		}

		// Summary
		const totalDuration = performance.now() - totalStartTime;
		Logger.info(`Total: ${allStories.length} tests from ${storyFiles.length} files`);
		Logger.timing('Total execution time', totalDuration);

		// Performance assessment
		if (totalDuration > 100) {
			Logger.warn(`Generation took ${totalDuration.toFixed(0)}ms. Consider optimizing or filtering stories.`);
		}

		process.exit(0);
	} catch (error) {
		Logger.error('Fatal error:', error.message);
		if (CONFIG.logging.verbose) {
			console.error(error);
		}
		process.exit(1);
	}
}

// ============================================================================
// CLI Help
// ============================================================================

if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log(`
Visual Regression Test Generator

Usage:
  node scripts/generate-visual-regression-tests.js [options]

Options:
  --verbose      Show detailed output
  --silent       Suppress all output (useful for CI/CD)
  --dry-run      Don't write file, just validate and show what would be generated
  --no-timings   Don't show timing information
  --help, -h     Show this help message

Configuration:
  Edit the CONFIG object in this script to customize:
  - Search directories
  - Include/exclude patterns
  - Storybook URL
  - Screenshot options
  - Output file path

Examples:
  # Normal usage
  node scripts/generate-visual-regression-tests.js

  # Verbose output for debugging
  node scripts/generate-visual-regression-tests.js --verbose

  # Silent mode for CI/CD
  node scripts/generate-visual-regression-tests.js --silent

  # Test without writing file
  node scripts/generate-visual-regression-tests.js --dry-run --verbose
`);
	process.exit(0);
}

// Run the script
main();

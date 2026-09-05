/**
 * Script to analyze color usage in frontend code
 * Identifies hardcoded Tailwind colors vs theme colors
 */
import fs from 'node:fs';
import { glob } from 'glob';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Theme colors (approved)
const THEME_COLORS = [
	'background',
	'foreground',
	'primary',
	'secondary',
	'destructive',
	'muted',
	'accent',
	'card',
	'border',
	'input',
	'ring',
	'success',
	'warning',
	'info',
	'danger',
	'special',
	'popover',
	'chart',
];

// Hardcoded Tailwind color scales
const HARDCODED_COLORS = [
	'slate',
	'gray',
	'zinc',
	'neutral',
	'stone',
	'red',
	'orange',
	'amber',
	'yellow',
	'lime',
	'green',
	'emerald',
	'teal',
	'cyan',
	'sky',
	'blue',
	'indigo',
	'violet',
	'purple',
	'fuchsia',
	'pink',
	'rose',
];

// Color pattern regex
const COLOR_PATTERN = new RegExp(
	`\\b(${[...THEME_COLORS, ...HARDCODED_COLORS].join('|')})(-\\d{2,3})?(/\\d{1,3})?\\b`,
	'g'
);

async function analyzeColors() {
	const frontendPath = path.join(__dirname, '../packages/frontend/src');

	// Find all .tsx and .ts files
	const files = await glob('**/*.{tsx,ts}', {
		cwd: frontendPath,
		ignore: ['**/*.test.{tsx,ts}', '**/*.stories.tsx', '**/*.d.ts'],
	});

	const results = {
		themeColors: new Map(), // color -> [{file, line, context}]
		hardcodedColors: new Map(), // color -> [{file, line, context}]
		summary: {
			totalFiles: 0,
			filesWithHardcodedColors: 0,
			themeColorUsages: 0,
			hardcodedColorUsages: 0,
		},
	};

	for (const file of files) {
		const filePath = path.join(frontendPath, file);
		const content = fs.readFileSync(filePath, 'utf-8');
		const lines = content.split('\n');

		let hasHardcodedColors = false;

		lines.forEach((line, lineIndex) => {
			// Skip comments
			if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
				return;
			}

			// Find all color matches
			const matches = [...line.matchAll(COLOR_PATTERN)];

			matches.forEach(match => {
				const fullMatch = match[0];
				const colorName = match[1];
				const shade = match[2] || '';
				const opacity = match[3] || '';
				const fullColor = `${colorName}${shade}${opacity}`;

				// Determine if it's a theme color or hardcoded
				const isThemeColor = THEME_COLORS.includes(colorName);
				const targetMap = isThemeColor ? results.themeColors : results.hardcodedColors;

				if (!targetMap.has(fullColor)) {
					targetMap.set(fullColor, []);
				}

				// Extract context (the className or style attribute)
				const contextMatch = line.match(/className=["'`]([^"'`]+)["'`]/);
				const context = contextMatch ? contextMatch[1] : line.trim();

				targetMap.get(fullColor).push({
					file: file.replace(/\\/g, '/'),
					line: lineIndex + 1,
					context: context.substring(0, 80),
				});

				if (isThemeColor) {
					results.summary.themeColorUsages++;
				} else {
					results.summary.hardcodedColorUsages++;
					hasHardcodedColors = true;
				}
			});
		});

		results.summary.totalFiles++;
		if (hasHardcodedColors) {
			results.summary.filesWithHardcodedColors++;
		}
	}

	return results;
}

function generateReport(results) {
	console.log('');
	console.log('='.repeat(80));
	console.log('COLOR USAGE ANALYSIS - Frontend');
	console.log('='.repeat(80));
	console.log('');

	console.log('📊 SUMMARY');
	console.log('-'.repeat(80));
	console.log(`Total files analyzed: ${results.summary.totalFiles}`);
	console.log(`Files with hardcoded colors: ${results.summary.filesWithHardcodedColors}`);
	console.log(`Theme color usages: ${results.summary.themeColorUsages}`);
	console.log(`Hardcoded color usages: ${results.summary.hardcodedColorUsages}`);
	console.log('');

	if (results.hardcodedColors.size > 0) {
		console.log('⚠️  HARDCODED COLORS (Should use theme colors)');
		console.log('-'.repeat(80));

		const sortedHardcoded = [...results.hardcodedColors.entries()].sort((a, b) => b[1].length - a[1].length);

		sortedHardcoded.forEach(([color, occurrences]) => {
			console.log(`\n${color} (${occurrences.length} occurrences):`);

			// Group by file
			const byFile = new Map();
			occurrences.forEach(occ => {
				if (!byFile.has(occ.file)) {
					byFile.set(occ.file, []);
				}
				byFile.get(occ.file).push(occ);
			});

			byFile.forEach((occs, file) => {
				console.log(`  ${file}`);
				occs.slice(0, 3).forEach(occ => {
					console.log(`    L${occ.line}: ${occ.context}`);
				});
				if (occs.length > 3) {
					console.log(`    ... and ${occs.length - 3} more`);
				}
			});
		});
		console.log('');
	}

	if (results.themeColors.size > 0) {
		console.log('✅ THEME COLORS (Good!)');
		console.log('-'.repeat(80));

		const sortedTheme = [...results.themeColors.entries()].sort((a, b) => b[1].length - a[1].length);

		sortedTheme.forEach(([color, occurrences]) => {
			console.log(`${color}: ${occurrences.length} usages`);
		});
		console.log('');
	}

	console.log('='.repeat(80));
	console.log('');

	if (results.summary.hardcodedColorUsages > 0) {
		console.log('💡 RECOMMENDATION:');
		console.log('Consider replacing hardcoded colors with theme colors for better maintainability.');
		console.log('Theme colors available:');
		console.log(`  ${THEME_COLORS.join(', ')}`);
		console.log('');
	}
}

// Run analysis
analyzeColors()
	.then(results => {
		generateReport(results);

		// Exit with error code if hardcoded colors found
		process.exit(results.summary.hardcodedColorUsages > 0 ? 1 : 0);
	})
	.catch(error => {
		console.error('Error analyzing colors:', error);
		process.exit(1);
	});

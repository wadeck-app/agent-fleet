/**
 * Synchronizes WORKSPACE_ID across all .env files
 *
 * Usage:
 *   node scripts/sync-workspace.js <workspace_id>        - Set WORKSPACE_ID in all .env files
 *   node scripts/sync-workspace.js --verify              - Verify all WORKSPACE_ID are identical
 *   node scripts/sync-workspace.js --verify <id>         - Verify all WORKSPACE_ID equal specific ID
 *
 * Examples:
 *   node scripts/sync-workspace.js 2                     - Set all to WORKSPACE_ID=2
 *   node scripts/sync-workspace.js --verify              - Check consistency
 *   node scripts/sync-workspace.js --verify 2            - Check all are set to 2
 */
import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');

const files = ['packages/backend/.env', 'packages/frontend/.env'];

/**
 * Extract WORKSPACE_ID from file content
 * @param {string} content - File content
 * @returns {string|null} - Extracted WORKSPACE_ID or null if not found
 */
function extractWorkspaceId(content) {
	// Match both WORKSPACE_ID and VITE_WORKSPACE_ID
	const match = content.match(/(VITE_)?WORKSPACE_ID=(\d+)/);
	return match ? match[2] : null;
}

/**
 * Read WORKSPACE_ID from all .env files
 * @returns {Object} - Map of file path to workspace ID
 */
function readAllWorkspaceIds() {
	const workspaceIds = {};

	files.forEach(file => {
		const filePath = path.join(projectRoot, file);

		if (!fs.existsSync(filePath)) {
			workspaceIds[file] = null;
			return;
		}

		const content = fs.readFileSync(filePath, 'utf8');
		workspaceIds[file] = extractWorkspaceId(content);
	});

	return workspaceIds;
}

/**
 * Verify mode: Check WORKSPACE_ID consistency
 * @param {string|undefined} expectedId - Expected ID (optional)
 */
function verifyMode(expectedId) {
	console.log('🔍 Verifying WORKSPACE_ID consistency...\n');

	const workspaceIds = readAllWorkspaceIds();
	const entries = Object.entries(workspaceIds);

	let hasErrors = false;
	let allIds = [];

	entries.forEach(([file, id]) => {
		if (id === null) {
			console.log(`⚠️  ${file}: WORKSPACE_ID not found`);
			hasErrors = true;
		} else {
			allIds.push(id);
			console.log(`✓ ${file}: WORKSPACE_ID=${id}`);
		}
	});

	console.log('');

	if (hasErrors) {
		console.error('❌ Some files are missing WORKSPACE_ID');
		process.exit(1);
	}

	// Check if specific ID was requested
	if (expectedId) {
		const mismatches = entries.filter(([_, id]) => id !== expectedId);

		if (mismatches.length > 0) {
			console.error(`❌ Expected WORKSPACE_ID=${expectedId}, but found mismatches:`);
			mismatches.forEach(([file, id]) => {
				console.error(`   ${file}: ${id}`);
			});
			process.exit(1);
		}

		console.log(`✅ All files have WORKSPACE_ID=${expectedId}`);
		process.exit(0);
	}

	// Check if all IDs are identical
	const uniqueIds = [...new Set(allIds)];

	if (uniqueIds.length > 1) {
		console.error('❌ WORKSPACE_ID mismatch detected:');
		entries.forEach(([file, id]) => {
			console.error(`   ${file}: ${id}`);
		});
		process.exit(1);
	}

	console.log(`✅ All files have identical WORKSPACE_ID=${uniqueIds[0]}`);
	process.exit(0);
}

/**
 * Update mode: Set WORKSPACE_ID in all .env files
 * @param {string} workspaceId - New workspace ID
 */
function updateMode(workspaceId) {
	let updatedCount = 0;
	let skippedCount = 0;

	files.forEach(file => {
		const filePath = path.join(projectRoot, file);

		if (!fs.existsSync(filePath)) {
			console.log(`⚠️  Skipped: ${file} (file does not exist)`);
			skippedCount++;
			return;
		}

		const content = fs.readFileSync(filePath, 'utf8');

		// Match both WORKSPACE_ID and VITE_WORKSPACE_ID
		const updated = content.replace(/(VITE_)?WORKSPACE_ID=\d+/g, `$1WORKSPACE_ID=${workspaceId}`);

		if (content === updated) {
			console.log(`✓ No change: ${file} (already set to ${workspaceId})`);
			return;
		}

		fs.writeFileSync(filePath, updated, 'utf8');
		console.log(`✓ Updated: ${file}`);
		updatedCount++;
	});

	console.log('');
	if (updatedCount > 0) {
		console.log(`✅ Successfully updated ${updatedCount} file(s) to WORKSPACE_ID=${workspaceId}`);
	}
	if (skippedCount > 0) {
		console.log(`⚠️  ${skippedCount} file(s) skipped (not found)`);
	}

	console.log('');
	console.log('🚀 You can now run: npm run dev');
}

// Main script
const args = process.argv.slice(2);

if (args.length === 0) {
	console.error('❌ Error: Missing argument');
	console.log('');
	console.log('Usage:');
	console.log('  node scripts/sync-workspace.js <workspace_id>      - Set WORKSPACE_ID in all .env files');
	console.log('  node scripts/sync-workspace.js --verify            - Verify all WORKSPACE_ID are identical');
	console.log('  node scripts/sync-workspace.js --verify <id>       - Verify all WORKSPACE_ID equal specific ID');
	console.log('');
	console.log('Examples:');
	console.log('  node scripts/sync-workspace.js 2');
	console.log('  node scripts/sync-workspace.js --verify');
	console.log('  node scripts/sync-workspace.js --verify 2');
	process.exit(1);
}

if (args[0] === '--verify') {
	const expectedId = args[1];

	if (expectedId && !/^\d+$/.test(expectedId)) {
		console.error(`❌ Error: WORKSPACE_ID must be a number, got: ${expectedId}`);
		process.exit(1);
	}

	verifyMode(expectedId);
} else {
	const workspaceId = args[0];

	if (!/^\d+$/.test(workspaceId)) {
		console.error(`❌ Error: WORKSPACE_ID must be a number, got: ${workspaceId}`);
		process.exit(1);
	}

	updateMode(workspaceId);
}

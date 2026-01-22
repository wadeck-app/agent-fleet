#!/usr/bin/env node
/**
 * Cleanup script to kill zombie E2E backend processes
 *
 * Usage:
 *   node scripts/cleanup-e2e-zombies.js
 *   npm run cleanup:e2e
 *
 * This script kills all processes listening on ports 4000-5999
 * (the range used by E2E tests for backend servers)
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function cleanupZombies() {
	console.log('🧹 Cleaning up zombie E2E backend processes...\n');

	if (process.platform === 'win32') {
		// Windows: Find all processes listening on ports 4000-5999
		try {
			const { stdout } = await execAsync('netstat -ano | findstr ":400[0-9]" | findstr "LISTENING"');
			const lines = stdout
				.trim()
				.split('\n')
				.filter(line => line.trim());

			if (lines.length === 0) {
				console.log('✅ No zombie processes found on ports 4000-4999');
				return;
			}

			// Extract PIDs
			const pids = new Set();
			lines.forEach(line => {
				const match = line.match(/\s+(\d+)\s*$/);
				if (match) {
					pids.add(match[1]);
				}
			});

			console.log(`Found ${pids.size} process(es) using ports 4000-4999:`);
			lines.forEach(line => console.log(`  ${line}`));
			console.log('');

			// Kill each PID with /T (tree) flag
			let killed = 0;
			for (const pid of pids) {
				try {
					await execAsync(`taskkill /PID ${pid} /T /F`);
					console.log(`✅ Killed PID ${pid} and its children`);
					killed++;
				} catch (error) {
					console.log(`⚠️  Could not kill PID ${pid} (already dead or access denied)`);
				}
			}

			console.log(`\n🎉 Cleanup complete! Killed ${killed}/${pids.size} process(es)`);
		} catch (error) {
			if (error.code === 1) {
				// No matches found
				console.log('✅ No zombie processes found on ports 4000-4999');
			} else {
				console.error('❌ Error during cleanup:', error.message);
			}
		}
	} else {
		// Unix/Linux/Mac: Use lsof to find processes on ports 4000-4999
		try {
			const { stdout } = await execAsync('lsof -ti:4000-4999 2>/dev/null || true');
			const pids = stdout
				.trim()
				.split('\n')
				.filter(pid => pid.trim());

			if (pids.length === 0) {
				console.log('✅ No zombie processes found on ports 4000-4999');
				return;
			}

			console.log(`Found ${pids.length} process(es) using ports 4000-4999`);

			// Kill each PID
			let killed = 0;
			for (const pid of pids) {
				try {
					await execAsync(`kill -9 ${pid}`);
					console.log(`✅ Killed PID ${pid}`);
					killed++;
				} catch (error) {
					console.log(`⚠️  Could not kill PID ${pid} (already dead or access denied)`);
				}
			}

			console.log(`\n🎉 Cleanup complete! Killed ${killed}/${pids.length} process(es)`);
		} catch (error) {
			console.error('❌ Error during cleanup:', error.message);
		}
	}

	// Also clean up port 5000-5999 (WORKSPACE_ID=1)
	console.log('\n🔍 Checking ports 5000-5999 (WORKSPACE_ID=1)...');
	if (process.platform === 'win32') {
		try {
			const { stdout } = await execAsync('netstat -ano | findstr ":500[0-9]" | findstr "LISTENING"');
			const lines = stdout
				.trim()
				.split('\n')
				.filter(line => line.trim());

			if (lines.length > 0) {
				const pids = new Set();
				lines.forEach(line => {
					const match = line.match(/\s+(\d+)\s*$/);
					if (match) {
						pids.add(match[1]);
					}
				});

				console.log(`Found ${pids.size} process(es) using ports 5000-5999`);
				for (const pid of pids) {
					try {
						await execAsync(`taskkill /PID ${pid} /T /F`);
						console.log(`✅ Killed PID ${pid} and its children`);
					} catch {}
				}
			} else {
				console.log('✅ No processes found on ports 5000-5999');
			}
		} catch (error) {
			if (error.code === 1) {
				console.log('✅ No processes found on ports 5000-5999');
			}
		}
	}

	console.log('\n✅ All cleanup operations complete!');
}

cleanupZombies().catch(error => {
	console.error('❌ Fatal error:', error);
	process.exit(1);
});

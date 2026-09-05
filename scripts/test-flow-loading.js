import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testFlowLoading() {
	const browser = await chromium.launch({ headless: true });

	try {
		const context = await browser.newContext({
			viewport: { width: 1920, height: 1080 },
		});
		const page = await context.newPage();

		// Capture console logs
		const consoleLogs = [];
		page.on('console', msg => {
			consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
		});
		page.on('pageerror', error => {
			consoleLogs.push(`[PAGE ERROR] ${error.message}`);
		});

		console.log('1. Navigating to flow editor...');
		await page.goto('http://localhost:5030/flows/new', {
			waitUntil: 'networkidle',
			timeout: 10000,
		});

		// Wait for flows to load
		console.log('2. Waiting for flows to load...');
		await page.waitForTimeout(3000);

		// Verify select has options
		const hasOptions = await page.evaluate(() => {
			const trigger = document.querySelector('[role="combobox"]');
			if (!trigger) return false;
			trigger.click();
			return new Promise(resolve => {
				setTimeout(() => {
					const listbox = document.querySelector('[role="listbox"]');
					const optionCount = listbox ? listbox.querySelectorAll('[role="option"]').length : 0;
					resolve(optionCount > 0);
				}, 500);
			});
		});

		console.log(`   ✓ Select has options: ${hasOptions}`);

		// Take screenshot before loading
		const tempDir = path.join(__dirname, '..', '.claude', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}
		await page.screenshot({ path: path.join(tempDir, 'flow-before-load.png') });

		// Select first flow (combobox is already open from the check above)
		console.log('3. Selecting first flow (simple-qa)...');
		await page.click('[role="option"]:first-child');
		await page.waitForTimeout(500);

		// Click Load button
		console.log('4. Clicking Load button...');
		await page.click('button:has-text("Load")');

		// Wait for navigation and flow to load
		console.log('5. Waiting for flow to load...');
		try {
			await page.waitForLoadState('networkidle', { timeout: 5000 });
		} catch (e) {
			// Ignore timeout, just continue
		}
		await page.waitForTimeout(3000);

		// Check if nodes appeared in the canvas
		const nodeInfo = await page.evaluate(() => {
			// Check React Flow nodes
			const nodes = document.querySelectorAll('[data-id]');
			return {
				nodeCount: nodes.length,
				nodeIds: Array.from(nodes)
					.slice(0, 5)
					.map(n => n.getAttribute('data-id')),
			};
		});

		console.log(`   ✓ Nodes in canvas: ${nodeInfo.nodeCount}`);
		console.log(`   ✓ Node IDs: ${nodeInfo.nodeIds.join(', ')}`);

		// Check page width
		const dimensions = await page.evaluate(() => {
			const main = document.querySelector('main');
			return {
				mainWidth: main ? main.offsetWidth : 0,
				viewportWidth: window.innerWidth,
			};
		});

		console.log(`   ✓ Main width: ${dimensions.mainWidth}px (viewport: ${dimensions.viewportWidth}px)`);

		// Take screenshot after loading
		await page.screenshot({ path: path.join(tempDir, 'flow-after-load.png'), fullPage: true });
		console.log(`\n✅ Screenshots saved to ${tempDir}`);

		// Summary
		console.log('\n=== Test Results ===');
		console.log(`Select has options: ${hasOptions ? '✅' : '❌'}`);
		console.log(`Flow loaded nodes: ${nodeInfo.nodeCount > 0 ? '✅' : '❌'} (${nodeInfo.nodeCount} nodes)`);
		console.log(`Full width: ${dimensions.mainWidth > 1500 ? '✅' : '❌'} (${dimensions.mainWidth}px)`);
	} catch (error) {
		console.error('❌ Error:', error.message);
	} finally {
		await browser.close();
	}
}

testFlowLoading();

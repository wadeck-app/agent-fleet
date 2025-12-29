import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function takeScreenshot() {
	const browser = await chromium.launch({ headless: true });

	try {
		const context = await browser.newContext({
			viewport: { width: 1920, height: 1080 },
		});
		const page = await context.newPage();

		// Capture console logs and errors
		const consoleLogs = [];
		page.on('console', msg => {
			consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
		});
		page.on('pageerror', error => {
			consoleLogs.push(`[PAGE ERROR] ${error.message}`);
		});

		console.log('Navigating to flow editor...');
		await page.goto('http://localhost:5030/flows/new', {
			waitUntil: 'networkidle',
			timeout: 10000,
		});

		// Wait for React to render
		await page.waitForTimeout(1000);

		// Ensure temp directory exists
		const tempDir = path.join(__dirname, '..', '.claude', 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}

		// Take screenshot
		const screenshotPath = path.join(tempDir, 'flow-editor-screenshot.png');
		await page.screenshot({ path: screenshotPath, fullPage: true });
		console.log(`Screenshot saved to: ${screenshotPath}`);

		// Click on select to open dropdown and take another screenshot
		await page.click('[role="combobox"]');
		await page.waitForTimeout(300);
		const screenshotPath2 = path.join(tempDir, 'flow-editor-screenshot-dropdown.png');
		await page.screenshot({ path: screenshotPath2, fullPage: true });
		console.log(`Screenshot with dropdown saved to: ${screenshotPath2}`);

		// Get page dimensions
		const dimensions = await page.evaluate(() => {
			const page = document.querySelector('[class*="Page"]') || document.body;
			return {
				pageWidth: page.offsetWidth,
				viewportWidth: window.innerWidth,
				hasMaxWidth: window.getComputedStyle(page).maxWidth !== 'none',
				maxWidth: window.getComputedStyle(page).maxWidth,
			};
		});
		console.log('Page dimensions:', dimensions);

		// Check select and look for flows data
		const selectInfo = await page.evaluate(() => {
			const trigger = document.querySelector('[role="combobox"]');
			if (!trigger) return { found: false };

			// Click to open the dropdown
			trigger.click();

			return new Promise(resolve => {
				setTimeout(() => {
					const content = document.querySelector('[role="listbox"]');
					resolve({
						found: true,
						triggerText: trigger.textContent,
						hasListbox: !!content,
						optionCount: content ? content.querySelectorAll('[role="option"]').length : 0,
						options: content
							? Array.from(content.querySelectorAll('[role="option"]'))
									.slice(0, 5)
									.map(o => o.textContent)
							: [],
					});
				}, 500);
			});
		});
		console.log('Select info:', selectInfo);

		// Check API call in network
		const networkLogs = [];
		page.on('response', response => {
			if (response.url().includes('/api/flows')) {
				networkLogs.push({
					url: response.url(),
					status: response.status(),
				});
			}
		});

		// Wait a bit to catch network calls
		await page.waitForTimeout(2000);
		console.log('Network calls to /api/flows:', networkLogs);
		console.log('\nConsole logs from page:');
		consoleLogs.forEach(log => console.log(log));
	} catch (error) {
		console.error('Error:', error.message);
	} finally {
		await browser.close();
	}
}

takeScreenshot();

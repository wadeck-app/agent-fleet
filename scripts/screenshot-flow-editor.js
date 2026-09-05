import path from 'node:path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function takeScreenshot() {
	const browser = await puppeteer.launch({
		headless: 'new',
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1920, height: 1080 });

		console.log('Navigating to flow editor...');
		await page.goto('http://localhost:5173/flows/new', {
			waitUntil: 'networkidle0',
			timeout: 10000,
		});

		// Wait a bit for React to render
		await page.waitForTimeout(1000);

		// Take screenshot
		const screenshotPath = path.join(__dirname, '..', '.claude', 'temp', 'flow-editor-screenshot.png');
		await page.screenshot({ path: screenshotPath, fullPage: true });
		console.log(`Screenshot saved to: ${screenshotPath}`);

		// Get some debug info
		const selectExists = await page.$('select, [role="combobox"]');
		console.log('Select/combobox element found:', !!selectExists);

		// Get page width
		const dimensions = await page.evaluate(() => {
			return {
				pageWidth: document.documentElement.scrollWidth,
				viewportWidth: window.innerWidth,
				bodyWidth: document.body.offsetWidth,
			};
		});
		console.log('Page dimensions:', dimensions);

		// Check if flows list is empty
		const flowsListHTML = await page.evaluate(() => {
			const selector = document.querySelector('[class*="Select"]') || document.querySelector('select');
			return selector ? selector.innerHTML : 'No select found';
		});
		console.log('Select content (first 200 chars):', flowsListHTML.substring(0, 200));
	} catch (error) {
		console.error('Error:', error.message);
	} finally {
		await browser.close();
	}
}

takeScreenshot();

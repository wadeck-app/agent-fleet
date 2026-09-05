import path from 'node:path';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Script to take screenshots of the application for visual verification
 * Usage: node scripts/screenshot.js [scenario]
 * Scenarios: ingredients-list, ingredients-modal, recipes-list
 */

async function takeScreenshot(scenario = 'ingredients-list') {
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });

		// Navigate to the app
		await page.goto('http://localhost:5173/ingredients', {
			waitUntil: 'networkidle0',
			timeout: 10000,
		});

		console.log('✓ Navigated to application');

		// Take screenshots based on scenario
		switch (scenario) {
			case 'ingredients-list':
				await page.screenshot({
					path: path.join(__dirname, '../screenshots/ingredients-list.png'),
					fullPage: true,
				});
				console.log('✓ Screenshot saved: screenshots/ingredients-list.png');
				break;

			case 'ingredients-modal':
				// Click the "Add Ingredient" button
				await page.waitForSelector('.btn-primary');
				await page.click('.btn-primary');
				await page.waitForSelector('.form-modal-overlay', { timeout: 2000 });
				// Wait for animation to complete
				await new Promise(resolve => setTimeout(resolve, 500));
				await page.screenshot({
					path: path.join(__dirname, '../screenshots/ingredients-modal.png'),
					fullPage: false,
				});
				console.log('✓ Screenshot saved: screenshots/ingredients-modal.png');
				break;

			case 'ingredients-modal-hover':
				// Click the "Add Ingredient" button
				await page.waitForSelector('.btn-primary');
				await page.click('.btn-primary');
				await page.waitForSelector('.form-modal-overlay', { timeout: 2000 });

				// Hover over close button
				await page.hover('.form-modal-close');
				await new Promise(resolve => setTimeout(resolve, 300)); // Wait for hover animation

				await page.screenshot({
					path: path.join(__dirname, '../screenshots/ingredients-modal-hover.png'),
					fullPage: false,
				});
				console.log('✓ Screenshot saved: screenshots/ingredients-modal-hover.png');
				break;

			case 'modal-close-button':
				// Click the "Add Ingredient" button
				await page.waitForSelector('.btn-primary');
				await page.click('.btn-primary');
				await page.waitForSelector('.form-modal-overlay', { timeout: 2000 });

				// Take a cropped screenshot of just the top-right corner
				const modal = await page.$('.form-modal-content');
				const box = await modal.boundingBox();

				await page.screenshot({
					path: path.join(__dirname, '../screenshots/modal-close-button.png'),
					clip: {
						x: box.x + box.width - 100,
						y: box.y - 30,
						width: 120,
						height: 80,
					},
				});
				console.log('✓ Screenshot saved: screenshots/modal-close-button.png');
				break;

			case 'ingredients-edit':
				// Click first edit button
				await page.waitForSelector('.btn-edit');
				await page.click('.btn-edit');
				await new Promise(resolve => setTimeout(resolve, 500));
				await page.screenshot({
					path: path.join(__dirname, '../screenshots/ingredients-edit.png'),
					fullPage: false,
				});
				console.log('✓ Screenshot saved: screenshots/ingredients-edit.png');
				break;

			case 'recipes-list':
				await page.goto('http://localhost:5173/recipes', {
					waitUntil: 'networkidle0',
					timeout: 10000,
				});
				await page.screenshot({
					path: path.join(__dirname, '../screenshots/recipes-list.png'),
					fullPage: true,
				});
				console.log('✓ Screenshot saved: screenshots/recipes-list.png');
				break;

			case 'all':
				// Take all screenshots
				await takeScreenshot('ingredients-list');
				await takeScreenshot('ingredients-modal');
				await takeScreenshot('ingredients-modal-hover');
				await takeScreenshot('recipes-list');
				break;

			default:
				console.error(`Unknown scenario: ${scenario}`);
				console.log(
					'Available scenarios: ingredients-list, ingredients-modal, ingredients-modal-hover, ingredients-edit, recipes-list, all'
				);
		}
	} catch (error) {
		console.error('Error taking screenshot:', error.message);
	} finally {
		await browser.close();
	}
}

// Get scenario from command line args
const scenario = process.argv[2] || 'ingredients-modal';
takeScreenshot(scenario);

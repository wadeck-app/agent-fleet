/**
 * Device configurations for screenshots and E2E testing
 * Centralizes viewport and user agent settings to avoid duplication
 *
 *  IMPORTANT: After modifying this file, update e2e/utils/devices.js to keep them in sync!
 */

export interface DeviceConfig {
	width: number;
	height: number;
	deviceScaleFactor: number;
	isMobile: boolean;
	hasTouch: boolean;
	userAgent: string;
}

// Pixel 9a device configuration
export const PIXEL_9A: DeviceConfig = {
	width: 412,
	height: 915,
	deviceScaleFactor: 2.625,
	isMobile: true,
	hasTouch: true,
	userAgent:
		'Mozilla/5.0 (Linux; Android 14; Pixel 9a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};

// Breakpoint configuration for responsive tests
export const RESPONSIVE_BREAKPOINTS = [
	{ name: 'Mobile Small', width: 320, height: 568 },
	{ name: 'Mobile Medium', width: 375, height: 667 },
	{ name: 'Pixel 9a', width: PIXEL_9A.width, height: PIXEL_9A.height },
	{ name: 'Tablet', width: 768, height: 1024 },
	{ name: 'Desktop Medium', width: 1280, height: 720 },
	{ name: 'Desktop Large', width: 1920, height: 1080 },
];

import type { StorybookConfig } from '@storybook/react-vite';
// @ts-ignore
import path, { dirname, join } from 'path';

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.@(ts|tsx)'],
	core: {
		disableTelemetry: true,
	},
	addons: [
		getAbsolutePath('@storybook/addon-essentials'),
		getAbsolutePath('@storybook/addon-interactions'),
		getAbsolutePath('@storybook/addon-a11y'),
		'@chromatic-com/storybook',
	],

	framework: {
		name: getAbsolutePath('@storybook/react-vite'),
		options: {},
	},

	docs: {},

	viteFinal: async config => {
		// Ensure compatibility with the main vite config
		if (config.resolve) {
			config.resolve.alias = {
				...config.resolve.alias,
				'@app/shared': path.resolve(__dirname, '../../shared-frontend-backend/src'),
			};
		}
		return config;
	},

	typescript: {
		reactDocgen: 'react-docgen-typescript',
	},
};

export default config;

function getAbsolutePath(value: string): any {
	return dirname(require.resolve(join(value, 'package.json')));
}

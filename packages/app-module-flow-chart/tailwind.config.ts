// @ts-expect-error - plain JS preset shipped by dsl-ui, no type declarations
import dslUiPreset, { dslUiContent } from '@wadeck-app/dsl-ui/tailwind-preset';
import type { Config } from 'tailwindcss';

/**
 * Tailwind config of src/dsl-components/style.css (`npm run css`, run by `npm run bundle`). The preset owns the
 * color tokens (success, danger, primary, surface, border, ...), so none is restated here. The content globs of
 * dsl-ui are required, not optional: the shell loads this sheet after its own, and a sheet that lacks the dsl-ui
 * utilities would override its longhands (see module-authoring.md, "Shipping components").
 */
export default {
	presets: [dslUiPreset],
	content: ['./src/**/*.{ts,tsx}', './src/dsl-views/*.yaml', ...(dslUiContent as string[])],
} satisfies Config;

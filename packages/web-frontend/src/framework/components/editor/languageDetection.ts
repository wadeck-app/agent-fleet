import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import type { Extension } from '@codemirror/state';

/**
 * Map file extensions to CodeMirror language extensions
 */
const EXTENSION_MAP: Record<string, () => Extension> = {
	js: () => javascript(),
	jsx: () => javascript({ jsx: true }),
	ts: () => javascript({ typescript: true }),
	tsx: () => javascript({ typescript: true, jsx: true }),
	json: () => json(),
	html: () => html(),
	htm: () => html(),
	css: () => css(),
	md: () => markdown(),
	markdown: () => markdown(),
	py: () => python(),
	yaml: () => yaml(),
	yml: () => yaml(),
};

/**
 * Get CodeMirror language extension for a given file extension
 */
export function getLanguageExtension(fileExtension?: string): Extension | null {
	if (!fileExtension) {
		return null;
	}

	const normalizedExt = fileExtension.toLowerCase().replace(/^\./, '');
	const langFactory = EXTENSION_MAP[normalizedExt];

	return langFactory ? langFactory() : null;
}

/**
 * Extract file extension from a path
 */
export function getFileExtension(path: string): string | null {
	const match = path.match(/\.([^.]+)$/);
	return match ? match[1] : null;
}

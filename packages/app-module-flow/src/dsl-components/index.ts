// violations-suppress: ts/no-barrel-index app-core-cli requires src/dsl-components/index.ts as the DSL library entry (default export of the component registry entries); it is not a re-export barrel
import { createElement } from 'react';

import type { ComponentRegistryEntry } from '@wadeck-app/dsl-renderer';

import { MarkdownText } from './MarkdownText.js';
import { MARKDOWN_TEXT_KEYS, readMarkdownTextProps } from './MarkdownTextProps.js';

// Registered by app-core as `flow:MarkdownText`.
const entries: ComponentRegistryEntry[] = [
	{
		name: 'MarkdownText',
		category: 'atomic',
		tags: ['flow', 'markdown', 'text'],
		knownKeys: [...MARKDOWN_TEXT_KEYS],
		render: ({ node, ctx }) => createElement(MarkdownText, readMarkdownTextProps(node, ctx)),
	},
];

export default entries;

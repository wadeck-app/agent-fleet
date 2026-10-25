// violations-suppress: ts/no-barrel-index app-core-cli requires src/dsl-components/index.ts as the DSL library entry (default export of the component registry entries); it is not a re-export barrel
import { createElement } from 'react';

import type { ComponentRegistryEntry } from '@wadeck-app/dsl-renderer';

import { LogStream } from './LogStream.js';
import { LOG_STREAM_KEYS, readLogStreamProps } from './LogStreamProps.js';
import { MarkdownText } from './MarkdownText.js';
import { MARKDOWN_TEXT_KEYS, readMarkdownTextProps } from './MarkdownTextProps.js';
import { RunBars } from './RunBars.js';
import { RUN_BARS_KEYS, readRunBarsProps } from './RunBarsProps.js';
import { RunList } from './RunList.js';
import { RUN_LIST_KEYS, readRunListProps } from './RunListProps.js';

// Registered by app-core as `flow:MarkdownText`, `flow:RunList`, `flow:RunBars` and `flow:LogStream`.
const entries: ComponentRegistryEntry[] = [
	{
		name: 'MarkdownText',
		category: 'atomic',
		tags: ['flow', 'markdown', 'text'],
		knownKeys: [...MARKDOWN_TEXT_KEYS],
		render: ({ node, ctx }) => createElement(MarkdownText, readMarkdownTextProps(node, ctx)),
	},
	{
		name: 'LogStream',
		category: 'composite',
		tags: ['flow', 'logs', 'list'],
		knownKeys: [...LOG_STREAM_KEYS],
		render: ({ node, ctx }) => createElement(LogStream, readLogStreamProps(node, ctx)),
	},
	{
		name: 'RunList',
		category: 'composite',
		tags: ['flow', 'runs', 'list'],
		knownKeys: [...RUN_LIST_KEYS],
		render: ({ node, ctx }) => createElement(RunList, readRunListProps(node, ctx)),
	},
	{
		name: 'RunBars',
		category: 'composite',
		tags: ['flow', 'runs', 'chart'],
		knownKeys: [...RUN_BARS_KEYS],
		render: ({ node, ctx }) => createElement(RunBars, readRunBarsProps(node, ctx)),
	},
];

export default entries;

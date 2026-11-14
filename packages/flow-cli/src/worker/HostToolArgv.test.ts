import type { HostTool } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import { HostToolArgv } from './HostToolArgv';

const tool = (command: string[]): HostTool => ({
	id: 't',
	description: 'd',
	sideEffect: 'read',
	command,
});

describe('HostToolArgv.build', () => {
	it.each([
		{ name: 'literals only', command: ['x', 'show', '--json'], values: {}, expected: ['show', '--json'] },
		{
			name: 'a whole-element placeholder',
			command: ['x', 'show', '{id}'],
			values: { id: 'T-1' },
			expected: ['show', 'T-1'],
		},
		{ name: 'a flag placeholder', command: ['x', '--id={id}'], values: { id: 'T-1' }, expected: ['--id=T-1'] },
		{
			name: 'an optional placeholder that was not given is dropped',
			command: ['x', 'list', '{status}', '--limit={n}'],
			values: {},
			expected: ['list'],
		},
		{
			name: 'a value is never split, expanded or interpreted',
			command: ['x', '{id}'],
			values: { id: 'a; rm -rf x $(id) `id` && b | cat *.txt ~ \n' },
			expected: ['a; rm -rf x $(id) `id` && b | cat *.txt ~ \n'],
		},
		{
			name: 'a value that looks like a placeholder is not substituted again',
			command: ['x', '{a}', '{b}'],
			values: { a: '{b}', b: 'real' },
			expected: ['{b}', 'real'],
		},
	])('$name', ({ command, values, expected }) => {
		expect(HostToolArgv.build(tool(command), values as Record<string, string>)).toEqual(expected);
	});

	it.each([
		{ name: 'a placeholder inside a word', element: 'x{id}' },
		{ name: 'two placeholders', element: '{a}{b}' },
		{ name: 'a placeholder in a short flag', element: '-i={id}' },
	])('refuses $name (validation should have refused it first), naming the tool and the element', ({ element }) => {
		expect(() => HostToolArgv.build(tool(['x', element]), { id: '1', a: '1', b: '2' })).toThrow(
			/Host tool 't'.*not a literal, a whole placeholder or a --flag=placeholder/
		);
	});
});

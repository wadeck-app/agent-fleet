import type { Task } from '@shared/api/tasks.contract';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskInfoCard, parseInputKey } from './TaskInfoCard';

describe('parseInputKey', () => {
	it('parses key without default value', () => {
		const result = parseInputKey('simpleKey');
		expect(result).toEqual({ name: 'simpleKey' });
	});

	it('parses key with default value (double quotes)', () => {
		const result = parseInputKey('reference_url || "None provided"');
		expect(result).toEqual({
			name: 'reference_url',
			defaultValue: 'None provided',
		});
	});

	it('parses key with default value (single quotes)', () => {
		const result = parseInputKey("dependencies || '[]'");
		expect(result).toEqual({
			name: 'dependencies',
			defaultValue: '[]',
		});
	});

	it('parses key with numeric default value', () => {
		const result = parseInputKey('completion_percent || 0');
		expect(result).toEqual({
			name: 'completion_percent',
			defaultValue: '0',
		});
	});

	it('parses key with boolean default value', () => {
		const result = parseInputKey('enabled || false');
		expect(result).toEqual({
			name: 'enabled',
			defaultValue: 'false',
		});
	});

	it('trims whitespace around key and default value', () => {
		const result = parseInputKey('  key  ||  "value"  ');
		expect(result).toEqual({
			name: 'key',
			defaultValue: 'value',
		});
	});

	it('handles unquoted default value', () => {
		const result = parseInputKey('count || 42');
		expect(result).toEqual({
			name: 'count',
			defaultValue: '42',
		});
	});
});

describe('TaskInfoCard', () => {
	const baseTask: Task = {
		id: 'task-1',
		description: 'Test task',
		status: 'in_progress',
		priority: 'medium',
		version: 1,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		assignedWorker: null,
	};

	it('renders basic task info without flow inputs', () => {
		render(<TaskInfoCard task={baseTask} />);

		expect(screen.getByText('Test task')).toBeInTheDocument();
		expect(screen.getByText('in progress')).toBeInTheDocument();
		expect(screen.getByText('medium')).toBeInTheDocument();

		// Flow Inputs section should not be present
		expect(screen.queryByText('Flow Inputs')).not.toBeInTheDocument();
	});

	it('does not render Flow Inputs section when flowInputs is empty object', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {},
		};

		render(<TaskInfoCard task={task} />);

		expect(screen.queryByText('Flow Inputs')).not.toBeInTheDocument();
	});

	it('renders Flow Inputs section with simple values', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {
				name: 'John Doe',
				count: 42,
				enabled: true,
			},
		};

		render(<TaskInfoCard task={task} />);

		expect(screen.getByText('Flow Inputs')).toBeInTheDocument();
		expect(screen.getByText('name')).toBeInTheDocument();
		expect(screen.getByText('John Doe')).toBeInTheDocument();
		expect(screen.getByText('count')).toBeInTheDocument();
		expect(screen.getByText('42')).toBeInTheDocument();
		expect(screen.getByText('enabled')).toBeInTheDocument();
		expect(screen.getByText('true')).toBeInTheDocument();
	});

	it('renders input keys with default values using (default: xxx) format', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {
				'reference_url || "None provided"': 'https://example.com',
				'completion_percent || 0': 50,
			},
		};

		render(<TaskInfoCard task={task} />);

		// Should show parsed name and default value
		expect(screen.getByText('reference_url')).toBeInTheDocument();
		expect(screen.getByText('(default: None provided)')).toBeInTheDocument();
		expect(screen.getByText('https://example.com')).toBeInTheDocument();

		expect(screen.getByText('completion_percent')).toBeInTheDocument();
		expect(screen.getByText('(default: 0)')).toBeInTheDocument();
		expect(screen.getByText('50')).toBeInTheDocument();
	});

	it('renders empty values with em dash placeholder', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {
				emptyString: '',
				nullValue: null,
			},
		};

		render(<TaskInfoCard task={task} />);

		expect(screen.getByText('Flow Inputs')).toBeInTheDocument();

		// Should render em dash for empty values
		const emDashes = screen.getAllByText('—');
		expect(emDashes.length).toBeGreaterThan(0);
	});

	it('renders multiline values in the same two-column layout with wrapping', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {
				task: 'Line 1\nLine 2\nLine 3',
			},
		};

		const { container } = render(<TaskInfoCard task={task} />);

		expect(screen.getByText('Flow Inputs')).toBeInTheDocument();
		expect(screen.getByText('task')).toBeInTheDocument();

		// Should be in a table row like all other values (no colspan, no pre block)
		const rows = container.querySelectorAll('tbody tr');
		expect(rows.length).toBe(1);
		// Each row has exactly 2 cells
		expect(rows[0].querySelectorAll('td').length).toBe(2);
	});

	it('renders long values in the same two-column layout with wrapping', () => {
		const longValue = 'a'.repeat(150);
		const task: Task = {
			...baseTask,
			flowInputs: {
				longText: longValue,
			},
		};

		const { container } = render(<TaskInfoCard task={task} />);

		expect(screen.getByText('Flow Inputs')).toBeInTheDocument();
		expect(screen.getByText('longText')).toBeInTheDocument();
		expect(screen.getByText(longValue)).toBeInTheDocument();

		// Should be in a table row with 2 cells (consistent layout)
		const rows = container.querySelectorAll('tbody tr');
		expect(rows.length).toBe(1);
		expect(rows[0].querySelectorAll('td').length).toBe(2);
	});

	it('renders complex objects as formatted JSON', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {
				config: { nested: { key: 'value' }, array: [1, 2, 3] },
			},
		};

		render(<TaskInfoCard task={task} />);

		expect(screen.getByText('Flow Inputs')).toBeInTheDocument();
		expect(screen.getByText('config')).toBeInTheDocument();

		// Should render formatted JSON content
		expect(screen.getByText(/"nested"/)).toBeInTheDocument();
		expect(screen.getByText(/"key"/)).toBeInTheDocument();
		expect(screen.getByText(/"value"/)).toBeInTheDocument();
	});

	it('displays flowId when present', () => {
		const task: Task = {
			...baseTask,
			flowId: 'flow-123',
		};

		render(<TaskInfoCard task={task} />);

		expect(screen.getByText(/Flow:/)).toBeInTheDocument();
		expect(screen.getByText('flow-123')).toBeInTheDocument();
	});

	it('displays assigned worker when present', () => {
		const task: Task = {
			...baseTask,
			assignedWorker: {
				workerId: 'worker-1',
			},
		};

		render(<TaskInfoCard task={task} />);

		expect(screen.getByText(/Worker:/)).toBeInTheDocument();
		expect(screen.getByText('worker-1')).toBeInTheDocument();
	});

	it('renders table layout for simple inputs', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {
				key1: 'value1',
				key2: 'value2',
			},
		};

		const { container } = render(<TaskInfoCard task={task} />);

		// Should use table layout
		const table = container.querySelector('table');
		expect(table).toBeInTheDocument();

		const tbody = container.querySelector('tbody');
		expect(tbody).toBeInTheDocument();

		// Should have rows for each input
		const rows = container.querySelectorAll('tbody tr');
		expect(rows.length).toBe(2);
	});

	it('renders mixed simple and multiline inputs correctly', () => {
		const task: Task = {
			...baseTask,
			flowInputs: {
				shortKey: 'short value',
				'longKey || "default"': 'a'.repeat(150),
				emptyKey: '',
			},
		};

		render(<TaskInfoCard task={task} />);

		expect(screen.getByText('Flow Inputs')).toBeInTheDocument();

		// Short value should be in table layout
		expect(screen.getByText('shortKey')).toBeInTheDocument();
		expect(screen.getByText('short value')).toBeInTheDocument();

		// Long value in same two-column layout
		expect(screen.getByText('longKey')).toBeInTheDocument();
		expect(screen.getByText('(default: default)')).toBeInTheDocument();

		// Empty value should show em dash
		expect(screen.getByText('emptyKey')).toBeInTheDocument();
		expect(screen.getByText('—')).toBeInTheDocument();
	});
});

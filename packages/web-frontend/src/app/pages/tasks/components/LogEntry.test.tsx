import type { LogEntry as LogEntryType } from '@shared/api/tasks.contract';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LogEntry } from './LogEntry';

describe('LogEntry', () => {
	const baseLog: LogEntryType = {
		id: 'log-1',
		timestamp: Date.now(),
		level: 'info',
		message: 'Test message',
		stepId: 'step-123',
		stepName: 'test-step',
		stepType: 'model',
	};

	it('renders basic log entry', () => {
		render(<LogEntry log={baseLog} />);

		expect(screen.getByText(/test message/i)).toBeInTheDocument();
		expect(screen.getByText('[test-step]')).toBeInTheDocument();
	});

	it('shows stepId on hover over step name', () => {
		const { container } = render(<LogEntry log={baseLog} />);

		const stepNameSpan = container.querySelector('.text-primary');
		expect(stepNameSpan).toHaveAttribute('title', 'step-123');
	});

	it('renders markdown for non-tool_use messages', () => {
		const logWithMarkdown: LogEntryType = {
			...baseLog,
			message: 'Message with **bold** text and `code`',
		};

		render(<LogEntry log={logWithMarkdown} />);

		// ReactMarkdown should render the markdown
		const boldText = screen.getByText('bold');
		expect(boldText.tagName).toBe('STRONG');

		const codeText = screen.getByText('code');
		expect(codeText.tagName).toBe('CODE');
	});

	it('renders tool_use messages with special formatting', () => {
		const toolUseLog: LogEntryType = {
			...baseLog,
			message: 'Tool: Read(file_path=/src/index.ts)',
			metadata: {
				eventType: 'tool_use',
			},
		};

		render(<LogEntry log={toolUseLog} />);

		// Should render Tool: Read in bold
		expect(screen.getByText('Read')).toBeInTheDocument();
		expect(screen.getByText('(file_path=/src/index.ts)')).toBeInTheDocument();
	});

	it('applies correct color classes based on log level', () => {
		const { container: errorContainer } = render(<LogEntry log={{ ...baseLog, level: 'error' }} />);
		const { container: warningContainer } = render(<LogEntry log={{ ...baseLog, level: 'warning' }} />);
		const { container: debugContainer } = render(<LogEntry log={{ ...baseLog, level: 'debug' }} />);

		// Check that level labels have appropriate color classes
		expect(errorContainer.querySelector('.text-destructive')).toBeInTheDocument();
		expect(warningContainer.querySelector('.text-warning')).toBeInTheDocument();
		expect(debugContainer.querySelector('.text-muted-foreground')).toBeInTheDocument();
	});

	it('renders markdown with inline paragraphs', () => {
		const logWithParagraphs: LogEntryType = {
			...baseLog,
			message: 'First paragraph\n\nSecond paragraph',
		};

		render(<LogEntry log={logWithParagraphs} />);

		// Verify the message is rendered (specific rendering depends on react-markdown)
		expect(screen.getByText(/First paragraph/)).toBeInTheDocument();
		expect(screen.getByText(/Second paragraph/)).toBeInTheDocument();
	});

	it('keeps existing selection functionality', () => {
		const onClick = () => {};
		const { container } = render(<LogEntry log={baseLog} onClick={onClick} isSelected={true} />);

		const logDiv = container.querySelector('[data-log-id="log-1"]');
		expect(logDiv).toHaveClass('bg-primary/10');
		expect(logDiv).toHaveClass('cursor-pointer');
	});

	it('does not show expand button for short messages', () => {
		const shortLog: LogEntryType = {
			...baseLog,
			message: 'Short message',
		};

		render(<LogEntry log={shortLog} />);

		// Should not have expand/collapse buttons
		expect(screen.queryByTitle('Expand full message')).not.toBeInTheDocument();
		expect(screen.queryByTitle('Collapse message')).not.toBeInTheDocument();
	});

	it('shows expand button for long messages', () => {
		const longLog: LogEntryType = {
			...baseLog,
			message: 'A'.repeat(600), // More than MESSAGE_TRUNCATE_LENGTH (500)
		};

		render(<LogEntry log={longLog} />);

		// Should show expand button
		expect(screen.getByTitle('Expand full message')).toBeInTheDocument();
	});

	it('truncates long messages initially', () => {
		const longMessage = 'A'.repeat(600);
		const longLog: LogEntryType = {
			...baseLog,
			message: longMessage,
		};

		const { container } = render(<LogEntry log={longLog} />);

		// Message should be truncated
		const messageDiv = container.querySelector('.min-w-0.flex-1.text-foreground');
		const displayedText = messageDiv?.textContent || '';

		// Should be truncated (500 chars + '...')
		expect(displayedText.length).toBeLessThan(longMessage.length);
		expect(displayedText).toContain('...');
	});

	it('expands message when expand button is clicked', async () => {
		const user = userEvent.setup();
		const longMessage = 'B'.repeat(600);
		const longLog: LogEntryType = {
			...baseLog,
			message: longMessage,
		};

		const { container } = render(<LogEntry log={longLog} />);

		// Click expand button
		const expandButton = screen.getByTitle('Expand full message');
		await user.click(expandButton);

		// Message should now be fully displayed
		const messageDiv = container.querySelector('.min-w-0.flex-1.text-foreground');
		const displayedText = messageDiv?.textContent || '';

		expect(displayedText).not.toContain('...');
		// Button should now show collapse
		expect(screen.getByTitle('Collapse message')).toBeInTheDocument();
	});

	it('collapses message when collapse button is clicked', async () => {
		const user = userEvent.setup();
		const longMessage = 'C'.repeat(600);
		const longLog: LogEntryType = {
			...baseLog,
			message: longMessage,
		};

		const { container } = render(<LogEntry log={longLog} />);

		// Expand first
		const expandButton = screen.getByTitle('Expand full message');
		await user.click(expandButton);

		// Then collapse
		const collapseButton = screen.getByTitle('Collapse message');
		await user.click(collapseButton);

		// Message should be truncated again
		const messageDiv = container.querySelector('.min-w-0.flex-1.text-foreground');
		const displayedText = messageDiv?.textContent || '';

		expect(displayedText).toContain('...');
		expect(screen.getByTitle('Expand full message')).toBeInTheDocument();
	});

	it('does not show expand button for tool_use messages', () => {
		const longToolUseLog: LogEntryType = {
			...baseLog,
			message: 'Tool: Read(file_path=' + 'A'.repeat(600) + ')',
			metadata: {
				eventType: 'tool_use',
			},
		};

		render(<LogEntry log={longToolUseLog} />);

		// Should not show expand button for tool_use messages
		expect(screen.queryByTitle('Expand full message')).not.toBeInTheDocument();
	});

	it('expand button click does not trigger row selection', async () => {
		const user = userEvent.setup();
		const onClick = vi.fn();
		const longLog: LogEntryType = {
			...baseLog,
			message: 'D'.repeat(600),
		};

		render(<LogEntry log={longLog} onClick={onClick} />);

		const expandButton = screen.getByTitle('Expand full message');
		await user.click(expandButton);

		// onClick should not have been called (stopPropagation works)
		expect(onClick).not.toHaveBeenCalled();
	});
});

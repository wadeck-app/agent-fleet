import type { FlowPluginDetail, FlowPluginsResponse } from '@shared/api/flow-daemon.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlowPluginDetail, useFlowPlugins } from '../hooks/useFlowPlugins';
import { FlowPluginsTab } from './FlowPluginsTab';

vi.mock('../hooks/useFlowPlugins', () => ({
	useFlowPlugins: vi.fn(),
	useFlowPluginDetail: vi.fn(),
}));

const plugins: FlowPluginsResponse = {
	plugins: [
		{ id: 'slack-notifier', extensionPoint: 'notification', typeString: 'NotifierPlugin' },
		{ id: 'git-source', extensionPoint: 'worker-source', typeString: 'SourcePlugin' },
	],
};

const slackDetail: FlowPluginDetail = {
	id: 'slack-notifier',
	extensionPoint: 'notification',
	typeString: 'NotifierPlugin',
	snippet: 'notifications:\n  - plugin: slack-notifier',
	options: { webhookUrl: 'string', channel: 'string' },
};

describe('FlowPluginsTab', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useFlowPlugins).mockReturnValue({ data: plugins, loading: false, error: null, refresh: vi.fn() });
		vi.mocked(useFlowPluginDetail).mockReturnValue({
			data: slackDetail,
			loading: false,
			error: null,
			refresh: vi.fn(),
		});
	});

	it('lists the plugins without loading any detail', () => {
		render(<FlowPluginsTab />);

		expect(screen.getByText('slack-notifier')).toBeInTheDocument();
		expect(screen.getByText('git-source')).toBeInTheDocument();
		expect(screen.getByText('worker-source')).toBeInTheDocument();
		expect(useFlowPluginDetail).not.toHaveBeenCalled();
	});

	it('shows the snippet and the options of the clicked plugin', () => {
		render(<FlowPluginsTab />);

		fireEvent.click(screen.getByText('slack-notifier'));

		expect(useFlowPluginDetail).toHaveBeenCalledWith('slack-notifier');
		expect(screen.getByLabelText('Plugin snippet')).toHaveTextContent('plugin: slack-notifier');
		expect(screen.getByText('webhookUrl')).toBeInTheDocument();
		expect(screen.getByText('channel')).toBeInTheDocument();
	});

	it('shows the backend error when the plugin detail cannot be loaded', () => {
		vi.mocked(useFlowPluginDetail).mockReturnValue({
			data: null,
			loading: false,
			error: "Plugin 'slack-notifier' failed to load: missing dependency",
			refresh: vi.fn(),
		});
		render(<FlowPluginsTab />);

		fireEvent.click(screen.getByText('slack-notifier'));

		expect(screen.getByRole('alert')).toHaveTextContent(
			"Plugin 'slack-notifier' failed to load: missing dependency"
		);
	});

	it('shows the backend error when the catalog cannot be loaded', () => {
		vi.mocked(useFlowPlugins).mockReturnValue({
			data: null,
			loading: false,
			error: 'Plugin catalog unavailable',
			refresh: vi.fn(),
		});

		render(<FlowPluginsTab />);

		expect(screen.getByRole('alert')).toHaveTextContent('Plugin catalog unavailable');
	});
});

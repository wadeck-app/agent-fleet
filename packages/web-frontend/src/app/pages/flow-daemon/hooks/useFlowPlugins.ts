import { useCallback } from 'react';

import type { FlowPluginDetail, FlowPluginsResponse } from '@shared/api/flow-daemon.contract';

import { flowDaemonService } from '../FlowDaemonService';
import { type FlowDaemonResource, useFlowDaemonResource } from './useFlowDaemonResource';

export function useFlowPlugins(): FlowDaemonResource<FlowPluginsResponse> {
	const fetchPlugins = useCallback(() => flowDaemonService.listPlugins(), []);
	return useFlowDaemonResource(fetchPlugins);
}

/** Snippet and options of one plugin. */
export function useFlowPluginDetail(pluginId: string): FlowDaemonResource<FlowPluginDetail> {
	const fetchPlugin = useCallback(() => flowDaemonService.getPlugin(pluginId), [pluginId]);
	return useFlowDaemonResource(fetchPlugin);
}

import * as React from 'react';

import { useUrlState } from '@framework/hooks/useUrlState';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

/**
 * ===========================================================================================
 * TABS WITH URL STATE
 * ===========================================================================================
 *
 * A wrapper around Radix UI Tabs that automatically syncs the active tab with URL state.
 * Provides a cleaner API compared to manually managing URL state for tabs.
 *
 * Features:
 * - Automatic URL synchronization
 * - Support for namespaced tabs (groupId)
 * - Nested tabs support (parentGroupId)
 * - localStorage fallback
 * - Type-safe tab values
 * - Inherits all Radix UI Tabs functionality
 *
 * @example Simple usage
 * ```typescript
 * <TabsWithUrlState paramKey="view" defaultValue="tasks">
 *   <TabsList>
 *     <TabsTrigger value="tasks">Tasks</TabsTrigger>
 *     <TabsTrigger value="scripts">Scripts</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="tasks">Tasks content</TabsContent>
 *   <TabsContent value="scripts">Scripts content</TabsContent>
 * </TabsWithUrlState>
 * ```
 *
 * @example With namespace
 * ```typescript
 * <TabsWithUrlState
 *   paramKey="view"
 *   groupId="workspace"
 *   defaultValue="tasks"
 * >
 *   <TabsList>
 *     <TabsTrigger value="tasks">Tasks</TabsTrigger>
 *     <TabsTrigger value="scripts">Scripts</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="tasks">Tasks content</TabsContent>
 *   <TabsContent value="scripts">Scripts content</TabsContent>
 * </TabsWithUrlState>
 * // URL: ?workspace.view=tasks
 * ```
 *
 * @example Nested tabs
 * ```typescript
 * <TabsWithUrlState
 *   paramKey="view"
 *   groupId="workspace"
 *   parentGroupId="project"
 *   parentValue={projectId}
 *   defaultValue="tasks"
 * >
 *   <TabsList>
 *     <TabsTrigger value="tasks">Tasks</TabsTrigger>
 *     <TabsTrigger value="scripts">Scripts</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="tasks">Tasks content</TabsContent>
 *   <TabsContent value="scripts">Scripts content</TabsContent>
 * </TabsWithUrlState>
 * // When projectId changes, view resets to "tasks"
 * ```
 *
 * @example With localStorage
 * ```typescript
 * <TabsWithUrlState
 *   paramKey="view"
 *   defaultValue="tasks"
 *   storageKey="workspace-view"
 * >
 *   <TabsList>
 *     <TabsTrigger value="tasks">Tasks</TabsTrigger>
 *     <TabsTrigger value="scripts">Scripts</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="tasks">Tasks content</TabsContent>
 *   <TabsContent value="scripts">Scripts content</TabsContent>
 * </TabsWithUrlState>
 * ```
 *
 * ===========================================================================================
 */

export interface TabsWithUrlStateProps extends Omit<
	React.ComponentPropsWithoutRef<typeof Tabs>,
	'value' | 'onValueChange'
> {
	/**
	 * The URL parameter key (will be prefixed with groupId if provided)
	 */
	paramKey: string;

	/**
	 * Optional group namespace (e.g., 'project', 'workspace')
	 * Creates parameters like: {groupId}.{paramKey}={value}
	 */
	groupId?: string;

	/**
	 * Parent group ID for nested tabs
	 * When parent value changes, tab value will reset to defaultValue
	 */
	parentGroupId?: string;

	/**
	 * Current parent value (for nested tabs)
	 */
	parentValue?: string | null;

	/**
	 * Default tab value
	 */
	defaultValue: string;

	/**
	 * Whether to clean up URL params that equal defaultValue
	 * Default: true
	 */
	cleanupDefault?: boolean;

	/**
	 * Optional callback when tab value changes
	 */
	onValueChange?: (value: string) => void;
}

/**
 * Tabs component with automatic URL state synchronization
 */
export function TabsWithUrlState({
	paramKey,
	groupId,
	parentGroupId,
	parentValue,
	defaultValue,
	cleanupDefault = true,
	onValueChange,
	children,
	...props
}: TabsWithUrlStateProps) {
	const [value, setValue] = useUrlState({
		key: paramKey,
		groupId,
		parentGroupId,
		parentValue,
		defaultValue,
		cleanupDefault,
	});

	const handleValueChange = React.useCallback(
		(newValue: string) => {
			setValue(newValue);
			onValueChange?.(newValue);
		},
		[setValue, onValueChange]
	);

	return (
		<Tabs value={value} onValueChange={handleValueChange} {...props}>
			{children}
		</Tabs>
	);
}

// Re-export supporting components for convenience
export { TabsList, TabsTrigger, TabsContent };

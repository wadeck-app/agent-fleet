import {
	Bell,
	BookOpen,
	FolderKanban,
	Layers,
	LayoutDashboard,
	LayoutGrid,
	ListTodo,
	PackageSearch,
	Sparkles,
	Table2,
	Users,
	Workflow,
} from 'lucide-react';

import type { NavItem } from './SidebarNav';

/**
 * Shared navigation configuration for both desktop and mobile sidebars.
 * Single source of truth for all navigation items.
 */
export const navigationItems: NavItem[] = [
	{
		path: '/dashboard',
		label: 'Dashboard',
		icon: LayoutDashboard,
	},
	{
		path: '/workers',
		label: 'Workers',
		icon: Users,
	},
	{
		path: '/tasks',
		label: 'Tasks',
		icon: ListTodo,
	},
	{
		path: '/projects',
		label: 'Projects',
		icon: FolderKanban,
	},
	{
		path: '/projects-v2',
		label: 'Projects v2',
		icon: Layers,
	},
	{
		path: '/interventions',
		label: 'Interventions',
		icon: Bell,
	},
	{
		path: '/interventions-v2',
		label: 'Interventions v2',
		icon: Table2,
	},
	{
		path: '/workspaces',
		label: 'Workspaces',
		icon: Layers,
	},
	{
		type: 'separator',
	},
	{
		path: '/flows/new',
		label: 'Flow Editor',
		icon: Workflow,
	},
	{
		path: '/ingredients2',
		label: 'Ingredients v2 table',
		icon: PackageSearch,
	},
	{
		path: '/ingredients3',
		label: 'Ingredients v3 grid',
		icon: LayoutGrid,
	},
	{
		path: '/ingredients4c',
		label: 'Ingredients v4 carousel',
		icon: Layers,
	},
	{
		path: '/ingredients5',
		label: 'Ingredients v5 ✨',
		icon: Sparkles,
	},
	{
		path: '/books',
		label: 'Books',
		icon: BookOpen,
	},
];

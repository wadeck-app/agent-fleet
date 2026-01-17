import {
	Bell,
	BookOpen,
	FolderKanban,
	Layers,
	LayoutDashboard,
	LayoutGrid,
	ListTodo,
	Package2,
	PackageSearch,
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
		path: '/ingredients',
		label: 'Ingredients',
		icon: Package2,
	},
	{
		path: '/ingredients2',
		label: 'Ingredients v2',
		icon: PackageSearch,
	},
	{
		path: '/ingredients3',
		label: 'Ingredients Grid',
		icon: LayoutGrid,
	},
	{
		path: '/ingredients4c',
		label: 'Ingredients v4c (Infinite Scroll)',
		icon: Layers,
	},
	{
		path: '/books',
		label: 'Books',
		icon: BookOpen,
	},
];

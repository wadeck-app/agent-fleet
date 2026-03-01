import {
	BookOpen,
	Boxes,
	FolderKanban,
	Layers,
	LayoutDashboard,
	LayoutGrid,
	ListTodo,
	PackageSearch,
	Sparkles,
	Table2,
	Ticket,
	Users,
	Workflow,
} from 'lucide-react';

import type { NavItem } from './SidebarNav';

/**
 * Shared navigation configuration for both desktop and mobile sidebars.
 * Single source of truth for all navigation items.
 *
 * Menu groups:
 * 1. Main views — user-facing screens with rich UI (dashboard, projects, interventions, flows)
 * 2. Data management — CRUD-oriented views that mirror the database (workers, tasks, projects list, workspaces)
 * 3. Sandbox — experimental/prototype pages (ingredients, books)
 */
export const navigationItems: NavItem[] = [
	// Main views
	{
		path: '/dashboard',
		label: 'Dashboard',
		icon: LayoutDashboard,
	},
	{
		path: '/projects-v2',
		label: 'Projects view',
		icon: Layers,
	},
	{
		path: '/interventions-v2',
		label: 'Interventions',
		icon: Table2,
	},
	{
		path: '/flows/new',
		label: 'Flow editor',
		icon: Workflow,
	},
	{
		type: 'separator',
	},
	// Data management — CRUD views that mirror the database (hierarchical order)
	{
		path: '/projects',
		label: 'Projects list',
		icon: FolderKanban,
	},
	{
		path: '/workspaces',
		label: 'Workspaces',
		icon: Layers,
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
		path: '/tickets',
		label: 'Tickets',
		icon: Ticket,
	},
	{
		type: 'separator',
	},
	// Sandbox — experimental/prototype pages
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
		label: 'Ingredients v5',
		icon: Sparkles,
	},
	{
		path: '/books',
		label: 'Books',
		icon: BookOpen,
	},
	{
		type: 'separator',
	},
	// Lego Experiments — Framework architecture patterns
	{
		path: '/lego/1/s1',
		label: 'Lego A1-S1: Simple Table',
		icon: Table2,
	},
	{
		path: '/lego/1/s2',
		label: 'Lego A1-S2: Table + Pagination',
		icon: Table2,
	},
	{
		path: '/lego/1/s3',
		label: 'Lego A1-S3: Full Featured',
		icon: Table2,
	},
	{
		path: '/lego/1/s4',
		label: 'Lego A1-S4: Grid + CRUD',
		icon: LayoutGrid,
	},
	{
		path: '/lego/1/s5',
		label: 'Lego A1-S5: Carousel',
		icon: Layers,
	},
	{
		path: '/lego/1/s6',
		label: 'Lego A1-S6: Item Detail',
		icon: Boxes,
	},
	{
		path: '/lego/2/s1',
		label: 'Lego A2-S1: Simple Table',
		icon: Table2,
	},
	{
		path: '/lego/2/s2',
		label: 'Lego A2-S2: Table + Pagination',
		icon: Table2,
	},
	{
		path: '/lego/2/s3',
		label: 'Lego A2-S3: Full Featured',
		icon: Table2,
	},
	{
		path: '/lego/2/s4',
		label: 'Lego A2-S4: Grid + CRUD',
		icon: LayoutGrid,
	},
	{
		path: '/lego/2/s5',
		label: 'Lego A2-S5: Carousel',
		icon: Layers,
	},
	{
		path: '/lego/2/s6',
		label: 'Lego A2-S6: Item Detail',
		icon: Boxes,
	},
];

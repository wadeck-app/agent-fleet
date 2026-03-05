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
	SplitSquareHorizontal,
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
		type: 'group',
		label: 'Lego — Widget Isolated',
		icon: Boxes,
		items: [
			{ path: '/lego/1/s1', label: 'S1: Simple Table', icon: Table2 },
			{ path: '/lego/1/s2', label: 'S2: Pagination', icon: Table2 },
			{ path: '/lego/1/s3', label: 'S3: Full Featured', icon: Table2 },
			{ path: '/lego/1/s4', label: 'S4: Grid + CRUD', icon: LayoutGrid },
			{ path: '/lego/1/s5', label: 'S5: Carousel', icon: Layers },
			{ path: '/lego/1/s6', label: 'S6: Item Detail', icon: SplitSquareHorizontal },
			{ path: '/lego/1/s7', label: 'S7: Master Detail Nav', icon: SplitSquareHorizontal },
			{ path: '/lego/1/s9', label: 'S9: Two Tables', icon: Table2 },
			{ path: '/lego/1/s10', label: 'S10: Inline Editing', icon: Table2 },
			{ path: '/lego/1/s11', label: 'S11: Three Edit Modes', icon: Table2 },
			{ path: '/lego/1/s_bus', label: 'S_BUS: Event Bus', icon: Boxes },
			{ path: '/lego/1/s_2tables', label: 'S_2TABLES: Two Tables', icon: Table2 },
			{ path: '/lego/1/s_edit', label: 'S_EDIT: Edit Modes', icon: Table2 },
			{ path: '/lego/1/s_fork_feat', label: 'S_FORK_FEAT: Feature Fork', icon: Sparkles },
			{ path: '/lego/1/s_ws', label: 'S_WS: WebSocket', icon: Workflow },
		],
	},
	{
		type: 'group',
		label: 'Lego — Context Provider',
		icon: Boxes,
		items: [
			{ path: '/lego/2/s1', label: 'S1: Simple Table', icon: Table2 },
			{ path: '/lego/2/s2', label: 'S2: Pagination', icon: Table2 },
			{ path: '/lego/2/s3', label: 'S3: Full Featured', icon: Table2 },
			{ path: '/lego/2/s4', label: 'S4: Grid + CRUD', icon: LayoutGrid },
			{ path: '/lego/2/s5', label: 'S5: Carousel', icon: Layers },
			{ path: '/lego/2/s6', label: 'S6: Item Detail', icon: SplitSquareHorizontal },
			{ path: '/lego/2/s7', label: 'S7: Master Detail Nav', icon: SplitSquareHorizontal },
			{ path: '/lego/2/s9', label: 'S9: Two Tables', icon: Table2 },
			{ path: '/lego/2/s10', label: 'S10: Inline Editing', icon: Table2 },
			{ path: '/lego/2/s11', label: 'S11: Three Edit Modes', icon: Table2 },
			{ path: '/lego/2/s_bus', label: 'S_BUS: Event Bus', icon: Boxes },
			{ path: '/lego/2/s_2tables', label: 'S_2TABLES: Two Tables', icon: Table2 },
			{ path: '/lego/2/s_edit', label: 'S_EDIT: Edit Modes', icon: Table2 },
			{ path: '/lego/2/s_fork_feat', label: 'S_FORK_FEAT: Feature Fork', icon: Sparkles },
			{ path: '/lego/2/s_ws', label: 'S_WS: WebSocket', icon: Workflow },
		],
	},
	{
		type: 'group',
		label: 'Lego — Feature Hooks',
		icon: Boxes,
		items: [
			{ path: '/lego/3/s1', label: 'S1: Simple Table', icon: Table2 },
			{ path: '/lego/3/s2', label: 'S2: Pagination', icon: Table2 },
			{ path: '/lego/3/s3', label: 'S3: Full Featured', icon: Table2 },
			{ path: '/lego/3/s4', label: 'S4: Grid + CRUD', icon: LayoutGrid },
			{ path: '/lego/3/s5', label: 'S5: Carousel', icon: Layers },
			{ path: '/lego/3/s6', label: 'S6: Item Detail', icon: SplitSquareHorizontal },
			{ path: '/lego/3/s7', label: 'S7: Master Detail Nav', icon: SplitSquareHorizontal },
			{ path: '/lego/3/s9', label: 'S9: Two Tables', icon: Table2 },
			{ path: '/lego/3/s10', label: 'S10: Inline Editing', icon: Table2 },
			{ path: '/lego/3/s11', label: 'S11: Three Edit Modes', icon: Table2 },
			{ path: '/lego/3/s_bus', label: 'S_BUS: Event Bus', icon: Boxes },
			{ path: '/lego/3/s_2tables', label: 'S_2TABLES: Two Tables', icon: Table2 },
			{ path: '/lego/3/s_edit', label: 'S_EDIT: Edit Modes', icon: Table2 },
			{ path: '/lego/3/s_fork_feat', label: 'S_FORK_FEAT: Feature Fork', icon: Sparkles },
			{ path: '/lego/3/s_ws', label: 'S_WS: WebSocket', icon: Workflow },
		],
	},
	{
		type: 'group',
		label: 'Lego — Context Children',
		icon: Boxes,
		items: [
			{ path: '/lego/4/s1', label: 'S1: Simple Table', icon: Table2 },
			{ path: '/lego/4/s2', label: 'S2: Pagination', icon: Table2 },
			{ path: '/lego/4/s3', label: 'S3: Full Featured', icon: Table2 },
			{ path: '/lego/4/s4', label: 'S4: Grid + CRUD', icon: LayoutGrid },
			{ path: '/lego/4/s5', label: 'S5: Carousel', icon: Layers },
			{ path: '/lego/4/s6', label: 'S6: Item Detail', icon: SplitSquareHorizontal },
			{ path: '/lego/4/s7', label: 'S7: Master Detail Nav', icon: SplitSquareHorizontal },
			{ path: '/lego/4/s9', label: 'S9: Two Tables', icon: Table2 },
			{ path: '/lego/4/s10', label: 'S10: Inline Editing', icon: Table2 },
			{ path: '/lego/4/s11', label: 'S11: Three Edit Modes', icon: Table2 },
			{ path: '/lego/4/s_bus', label: 'S_BUS: Event Bus', icon: Boxes },
			{ path: '/lego/4/s_2tables', label: 'S_2TABLES: Two Tables', icon: Table2 },
			{ path: '/lego/4/s_edit', label: 'S_EDIT: Edit Modes', icon: Table2 },
			{ path: '/lego/4/s_fork_feat', label: 'S_FORK_FEAT: Feature Fork', icon: Sparkles },
			{ path: '/lego/4/s_ws', label: 'S_WS: WebSocket', icon: Workflow },
		],
	},
	{
		type: 'group',
		label: 'Lego — Query Pipeline',
		icon: Boxes,
		items: [
			{ path: '/lego/5/s1', label: 'S1: Simple Table', icon: Table2 },
			{ path: '/lego/5/s2', label: 'S2: Pagination', icon: Table2 },
			{ path: '/lego/5/s3', label: 'S3: Full Featured', icon: Table2 },
			{ path: '/lego/5/s4', label: 'S4: Grid + CRUD', icon: LayoutGrid },
			{ path: '/lego/5/s5', label: 'S5: Carousel', icon: Layers },
			{ path: '/lego/5/s6', label: 'S6: Item Detail', icon: SplitSquareHorizontal },
			{ path: '/lego/5/s7', label: 'S7: Master Detail Nav', icon: SplitSquareHorizontal },
			{ path: '/lego/5/s9', label: 'S9: Two Tables', icon: Table2 },
			{ path: '/lego/5/s10', label: 'S10: Inline Editing', icon: Table2 },
			{ path: '/lego/5/s11', label: 'S11: Three Edit Modes', icon: Table2 },
			{ path: '/lego/5/s_bus', label: 'S_BUS: Event Bus', icon: Boxes },
			{ path: '/lego/5/s_2tables', label: 'S_2TABLES: Two Tables', icon: Table2 },
			{ path: '/lego/5/s_edit', label: 'S_EDIT: Edit Modes', icon: Table2 },
			{ path: '/lego/5/s_fork_feat', label: 'S_FORK_FEAT: Feature Fork', icon: Sparkles },
			{ path: '/lego/5/s_ws', label: 'S_WS: WebSocket', icon: Workflow },
		],
	},
	{
		type: 'group',
		label: 'Lego — Data2 Based',
		icon: Boxes,
		items: [
			{ path: '/lego/6/s1', label: 'S1: Simple Table', icon: Table2 },
			{ path: '/lego/6/s2', label: 'S2: Pagination', icon: Table2 },
			{ path: '/lego/6/s3', label: 'S3: Full Featured', icon: Table2 },
			{ path: '/lego/6/s4', label: 'S4: Grid + CRUD', icon: LayoutGrid },
			{ path: '/lego/6/s5', label: 'S5: Carousel', icon: Layers },
			{ path: '/lego/6/s6', label: 'S6: Item Detail', icon: SplitSquareHorizontal },
			{ path: '/lego/6/s7', label: 'S7: Master Detail Nav', icon: SplitSquareHorizontal },
			{ path: '/lego/6/s9', label: 'S9: Two Tables', icon: Table2 },
			{ path: '/lego/6/s10', label: 'S10: Inline Editing', icon: Table2 },
			{ path: '/lego/6/s11', label: 'S11: Three Edit Modes', icon: Table2 },
			{ path: '/lego/6/s_bus', label: 'S_BUS: Event Bus', icon: Boxes },
			{ path: '/lego/6/s_2tables', label: 'S_2TABLES: Two Tables', icon: Table2 },
			{ path: '/lego/6/s_edit', label: 'S_EDIT: Edit Modes', icon: Table2 },
			{ path: '/lego/6/s_fork_feat', label: 'S_FORK_FEAT: Feature Fork', icon: Sparkles },
			{ path: '/lego/6/s_ws', label: 'S_WS: WebSocket', icon: Workflow },
		],
	},
];

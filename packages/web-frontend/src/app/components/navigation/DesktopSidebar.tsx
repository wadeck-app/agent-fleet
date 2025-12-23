import { Separator } from '@framework/components/primitives/Separator';
import { ConnectivityIndicator } from '@framework/features/connectivity/ConnectivityIndicator';
import { useTheme } from '@framework/features/theme/useTheme';
import { BookOpen, FolderKanban, LayoutDashboard, ListTodo, Package2, Users } from 'lucide-react';

import { WorkspaceIndicator } from '@app/features/workspace/WorkspaceIndicator';

import { AppSwitcher } from './AppSwitcher';
import { type NavItem, SidebarNav } from './SidebarNav';
import { UserMenuWithTheme } from './UserMenuWithTheme';

const navigationItems: NavItem[] = [
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
		path: '/workspaces',
		label: 'Workspaces',
		icon: FolderKanban,
	},
	{
		type: 'separator',
	},
	{
		path: '/ingredients',
		label: 'Ingredients',
		icon: Package2,
	},
	{
		path: '/books',
		label: 'Books',
		icon: BookOpen,
	},
];

interface DesktopSidebarProps {
	className?: string;
}

export function DesktopSidebar({ className }: DesktopSidebarProps) {
	const { theme, toggleTheme } = useTheme();

	return (
		<aside
			className={`
     fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card
     ${className || ''}
   `}
		>
			<div className="shrink-0 p-4">
				<AppSwitcher />
			</div>

			<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
				<SidebarNav items={navigationItems} />

				<Separator />

				<div className="flex flex-col gap-2">
					<WorkspaceIndicator />
					<ConnectivityIndicator />
				</div>
			</div>

			<div className="shrink-0 border-t p-4">
				<UserMenuWithTheme theme={theme} onToggleTheme={toggleTheme} />
			</div>
		</aside>
	);
}

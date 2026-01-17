import { Separator } from '@framework/components/primitives/Separator';
import { ConnectivityIndicator } from '@framework/features/connectivity/ConnectivityIndicator';
import { useTheme } from '@framework/features/theme/useTheme';

import { ConnectionModeIndicator } from '@app/components/connectivity/ConnectionModeIndicator';
import { WorkspaceIndicator } from '@app/features/workspace/WorkspaceIndicator';

import { AppSwitcher } from './AppSwitcher';
import { SidebarNav } from './SidebarNav';
import { UserMenuWithTheme } from './UserMenuWithTheme';
import { navigationItems } from './navigationConfig';

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

				<div className="flex flex-col gap-3">
					<WorkspaceIndicator />
					<ConnectivityIndicator />
					<ConnectionModeIndicator />
				</div>
			</div>

			<div className="shrink-0 border-t p-4">
				<UserMenuWithTheme theme={theme} onToggleTheme={toggleTheme} />
			</div>
		</aside>
	);
}

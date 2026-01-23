import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button } from '@framework/components/primitives/Button';
import { Separator } from '@framework/components/primitives/Separator';
import { Sheet, SheetContent, SheetTrigger } from '@framework/components/primitives/sheet';
import { ConnectivityIndicator } from '@framework/features/connectivity/ConnectivityIndicator';
import { useTheme } from '@framework/features/theme/useTheme';
import { Menu } from 'lucide-react';

import { ConnectionModeIndicator } from '@app/components/connectivity/ConnectionModeIndicator';
import { WorkspaceIndicator } from '@app/features/workspace/WorkspaceIndicator';

import { AppSwitcher } from './AppSwitcher';
import { EventDebugWidget } from './EventDebugWidget';
import { SidebarNav } from './SidebarNav';
import { UserMenu } from './UserMenu';
import { WorkersWidget } from './WorkersWidget';
import { navigationItems } from './navigationConfig';

export function MobileSidebar() {
	const [open, setOpen] = useState(false);
	const location = useLocation();
	const { theme, toggleTheme } = useTheme();

	// @formatter:off
	// Auto-close sidebar when navigating to a new route
	useEffect(() => {
		setOpen(false);
	}, [location.pathname]);
	// @formatter:on

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className={`
       fixed top-4 left-4 z-50
       md:hidden
     `}
				>
					<Menu className="size-7" />
					<span className="sr-only">Toggle navigation menu</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				side="left"
				className={`
      w-[85vw] max-w-sm p-0 text-base
      sm:w-96
    `}
			>
				<div className="flex h-full max-h-screen flex-col overflow-hidden">
					<div className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-3">
						<AppSwitcher compact />
					</div>

					<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-2">
						<SidebarNav items={navigationItems} mobile />

						<Separator />

						<WorkersWidget />

						<EventDebugWidget />

						<Separator />

						<div className="flex flex-col gap-3">
							<WorkspaceIndicator />
							<ConnectivityIndicator />
							<ConnectionModeIndicator />
						</div>
					</div>

					<div className="shrink-0 border-t px-5 py-3">
						<UserMenu isMobile showTheme theme={theme} onToggleTheme={toggleTheme} showTransport />
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

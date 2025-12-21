import { Separator } from '@framework/components/primitives/Separator';
import { ConnectivityIndicator } from '@framework/features/connectivity/ConnectivityIndicator';
import { ThemeToggle } from '@framework/features/theme/ThemeToggle';
import { useTheme } from '@framework/features/theme/useTheme';
import { BookOpen, Package2 } from 'lucide-react';

import { UserMenuEnhanced } from '@app/components/navigation/UserMenuEnhanced';

import { AppSwitcher } from './AppSwitcher';
import { type NavItem, SidebarNav } from './SidebarNav';

const navigationItems: NavItem[] = [
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

interface SidebarProps {
	className?: string;
}

export function Sidebar({ className }: SidebarProps) {
	const { theme, toggleTheme } = useTheme();

	return (
		<aside
			className={`
    flex min-h-screen w-64 flex-col border-r bg-card
    ${className || ''}
  `}
		>
			<div className="flex flex-col gap-4 p-4">
				<AppSwitcher />
			</div>

			<div className="flex flex-1 flex-col gap-4 p-4">
				<SidebarNav items={navigationItems} />

				<Separator />

				<div className="flex items-center gap-2">
					<ThemeToggle theme={theme} onToggle={toggleTheme} />
					<ConnectivityIndicator />
				</div>
			</div>

			<div className="border-t p-4">
				{/*<UserMenu />*/}
				<UserMenuEnhanced />
				{/*<UserMenuCompact />*/}
			</div>
		</aside>
	);
}

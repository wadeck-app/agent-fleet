import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@framework/components/overlays/DropdownMenu';
import { Button } from '@framework/components/primitives/Button';
import { ChevronDown, LogOut, Moon, Settings, Sun, User } from 'lucide-react';

interface UserMenuWithThemeProps {
	userName?: string;
	theme: 'light' | 'dark';
	onToggleTheme: () => void;
	className?: string;
}

/**
 * User Menu with integrated Theme Toggle
 * Compact design with proper spacing and mobile-friendly sizes
 */
export function UserMenuWithTheme({ userName = 'User', theme, onToggleTheme, className }: UserMenuWithThemeProps) {
	const isDark = theme === 'dark';

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className={`
       w-full justify-start py-2
       ${className || ''}
     `}
				>
					<span className="flex-1 truncate text-left text-sm font-medium">{userName}</span>
					<ChevronDown className="size-4 shrink-0 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="right"
				sideOffset={8}
				className={`
     mb-2 w-56
   `}
			>
				<DropdownMenuItem className="cursor-pointer">
					<User className="size-4" />
					Profile
				</DropdownMenuItem>
				<DropdownMenuItem className="cursor-pointer">
					<Settings className="size-4" />
					Settings
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onToggleTheme} className="cursor-pointer">
					{isDark ? (
						<>
							<Sun className="size-4" />
							Light Mode
						</>
					) : (
						<>
							<Moon className="size-4" />
							Dark Mode
						</>
					)}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive" className="cursor-pointer">
					<LogOut className="size-4" />
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Mobile-optimized version with larger touch targets
 */
export function UserMenuWithThemeMobile({
	userName = 'User',
	theme,
	onToggleTheme,
	className,
}: UserMenuWithThemeProps) {
	const isDark = theme === 'dark';

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className={`
       w-full justify-start py-3
       ${className || ''}
     `}
				>
					<span className="flex-1 truncate text-left text-base font-medium">{userName}</span>
					<ChevronDown className="size-5 shrink-0 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" side="top" sideOffset={8} className="w-64">
				<DropdownMenuItem className="cursor-pointer py-3 text-base">
					<User className="size-5" />
					Profile
				</DropdownMenuItem>
				<DropdownMenuItem className="cursor-pointer py-3 text-base">
					<Settings className="size-5" />
					Settings
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={onToggleTheme}
					className={`
      cursor-pointer py-3 text-base
    `}
				>
					{isDark ? (
						<>
							<Sun className="size-5" />
							Light Mode
						</>
					) : (
						<>
							<Moon className="size-5" />
							Dark Mode
						</>
					)}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					className={`
      cursor-pointer py-3 text-base
    `}
				>
					<LogOut className="size-5" />
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

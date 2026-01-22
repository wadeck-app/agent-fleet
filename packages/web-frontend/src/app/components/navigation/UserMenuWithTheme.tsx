import { useState } from 'react';

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@framework/components/overlays/DropdownMenu';
import { Button } from '@framework/components/primitives/Button';
import { ChevronDown, LogOut, Moon, Network, Settings, Sun, User } from 'lucide-react';

import { useTransport } from '@/transport';

import type { TransportMode } from '@app/components/connectivity/TransportModeSelector';

interface UserMenuWithThemeProps {
	userName?: string;
	theme: 'light' | 'dark';
	onToggleTheme: () => void;
	className?: string;
}

const TRANSPORT_MODES: Array<{ value: TransportMode; label: string }> = [
	{ value: 'auto', label: 'Auto' },
	{ value: 'websocket', label: 'WebSocket' },
	{ value: 'sse', label: 'SSE' },
	{ value: 'long-polling', label: 'Long Polling' },
	{ value: 'http-polling', label: 'HTTP Polling' },
];

/**
 * User Menu with integrated Theme Toggle
 * Compact design with proper spacing and mobile-friendly sizes
 */
export function UserMenuWithTheme({ userName = 'User', theme, onToggleTheme, className }: UserMenuWithThemeProps) {
	const isDark = theme === 'dark';
	const { switchTransport } = useTransport();

	const [selectedMode, setSelectedMode] = useState<TransportMode>(() => {
		const saved = localStorage.getItem('transport_mode') as TransportMode;
		return saved || 'auto';
	});

	const handleTransportChange = async (value: string) => {
		const mode = value as TransportMode;
		setSelectedMode(mode);

		try {
			await switchTransport(mode);
		} catch (error) {
			console.error('[UserMenu] Failed to switch transport:', error);
		}
	};

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
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<Network className="size-4" />
						(Dev) Transport Mode
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuRadioGroup value={selectedMode} onValueChange={handleTransportChange}>
							{TRANSPORT_MODES.map(mode => (
								<DropdownMenuRadioItem key={mode.value} value={mode.value}>
									{mode.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
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
	const { switchTransport } = useTransport();

	const [selectedMode, setSelectedMode] = useState<TransportMode>(() => {
		const saved = localStorage.getItem('transport_mode') as TransportMode;
		return saved || 'auto';
	});

	const handleTransportChange = async (value: string) => {
		const mode = value as TransportMode;
		setSelectedMode(mode);

		try {
			await switchTransport(mode);
		} catch (error) {
			console.error('[UserMenu] Failed to switch transport:', error);
		}
	};

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
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="py-3 text-base">
						<Network className="size-5" />
						(Dev) Transport Mode
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuRadioGroup value={selectedMode} onValueChange={handleTransportChange}>
							{TRANSPORT_MODES.map(mode => (
								<DropdownMenuRadioItem key={mode.value} value={mode.value} className={`py-2 text-base`}>
									{mode.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onToggleTheme} className={`cursor-pointer py-3 text-base`}>
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
				<DropdownMenuItem variant="destructive" className={`cursor-pointer py-3 text-base`}>
					<LogOut className="size-5" />
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

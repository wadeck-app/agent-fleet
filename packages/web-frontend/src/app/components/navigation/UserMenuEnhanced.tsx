import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@framework/components/overlays/DropdownMenu';
import { Button } from '@framework/components/primitives/Button';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';

import { WorkspaceIndicator } from '@app/features/workspace/WorkspaceIndicator';

interface UserMenuEnhancedProps {
	userName?: string;
	userEmail?: string;
	userAvatar?: string;
	className?: string;
}

/**
 * Enhanced User Menu with avatar, name, and better layout
 *
 * Options de design proposées :
 * 1. Version actuelle (icon seulement)
 * 2. Version avec avatar + nom visible dans la sidebar
 * 3. Version compacte avec badge de statut
 */
export function UserMenuEnhanced({ userName = 'User', userEmail, userAvatar, className }: UserMenuEnhancedProps) {
	// @formatter:off
	// Generate initials from userName (e.g., "John Doe" -> "JD")
	const initials = userName
		.split(' ')
		.map(n => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
	// @formatter:on

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className={`
       w-full justify-start gap-3
       ${className || ''}
     `}
				>
					<div
						className={`
        flex size-8 items-center justify-center rounded-full bg-primary
        text-primary-foreground
      `}
					>
						{userAvatar ? (
							<img src={userAvatar} alt={userName} className={`size-8 rounded-full object-cover`} />
						) : (
							<span className="text-xs font-medium">{initials}</span>
						)}
					</div>
					<div className="flex flex-1 flex-col items-start gap-0.5">
						<span className="text-sm font-medium">{userName}</span>
						{userEmail && <span className="text-xs text-muted-foreground">{userEmail}</span>}
					</div>
					<ChevronDown className="size-4 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[240px]">
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col gap-1">
						<p className="text-sm font-medium">{userName}</p>
						{userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="px-2 py-1.5">
					<WorkspaceIndicator />
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem>
					<User className="size-4" />
					Profile
				</DropdownMenuItem>
				<DropdownMenuItem>
					<Settings className="size-4" />
					Settings
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive">
					<LogOut className="size-4" />
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Compact version - just icon with better dropdown
 */
export function UserMenuCompact({ className }: { className?: string }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className={`
       relative
       ${className || ''}
     `}
				>
					<User className="size-5" />
					{/* Optional: Status badge */}
					<span
						className={`
        absolute right-0 bottom-0 size-2 rounded-full bg-accent ring-2
        ring-background
      `}
					/>
					<span className="sr-only">User menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[240px]">
				<DropdownMenuLabel>
					<div className="flex items-center gap-3">
						<div
							className={`
         flex size-10 items-center justify-center rounded-full bg-primary
         text-primary-foreground
       `}
						>
							<User className="size-5" />
						</div>
						<div className="flex flex-col gap-0.5">
							<p className="text-sm font-medium">User Name</p>
							<p className="text-xs text-muted-foreground">user@example.com</p>
						</div>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="px-2 py-1.5">
					<WorkspaceIndicator />
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem>
					<User className="size-4" />
					Profile
				</DropdownMenuItem>
				<DropdownMenuItem>
					<Settings className="size-4" />
					Settings
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem variant="destructive">
					<LogOut className="size-4" />
					Logout
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

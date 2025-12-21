import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@framework/components/overlays/DropdownMenu';
import { Button } from '@framework/components/primitives/Button';
import { LogOut, Settings, User } from 'lucide-react';

import { WorkspaceIndicator } from '@app/features/workspace/WorkspaceIndicator';

interface UserMenuProps {
	className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className={className}>
					<User className="size-5" />
					<span className="sr-only">User menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[200px]">
				<div className="px-2 py-1.5">
					<WorkspaceIndicator />
				</div>
				<DropdownMenuSeparator />
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

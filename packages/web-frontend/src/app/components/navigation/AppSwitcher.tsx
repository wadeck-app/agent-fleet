import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@framework/components/overlays/DropdownMenu';
import { Button } from '@framework/components/primitives/Button';
import { ChevronDown } from 'lucide-react';

interface AppSwitcherProps {
	className?: string;
	compact?: boolean;
}

export function AppSwitcher({ className, compact = false }: AppSwitcherProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					className={`
       ${compact ? 'h-9 px-2 text-sm' : ''}
       ${className || ''}
     `}
				>
					<span className={compact ? 'font-medium' : 'font-semibold'}>App</span>
					<ChevronDown className="ml-auto size-4 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-[200px]">
				<DropdownMenuItem>
					<span className="font-medium">App</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

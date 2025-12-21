import { Link, useLocation } from 'react-router-dom';

import { Button } from '@framework/components/primitives/Button';
import { type LucideIcon } from 'lucide-react';

export interface NavItem {
	path: string;
	label: string;
	icon: LucideIcon;
}

interface SidebarNavProps {
	items: NavItem[];
	className?: string;
	mobile?: boolean;
}

export function SidebarNav({ items, className, mobile = false }: SidebarNavProps) {
	const location = useLocation();

	// @formatter:off
	// Check if current path starts with item path to handle nested routes
	const isActive = (path: string) => location.pathname.startsWith(path);
	// @formatter:on

	return (
		<nav className={className}>
			<div className="space-y-2">
				{items.map(item => {
					const Icon = item.icon;
					return (
						<Button
							key={item.path}
							asChild
							variant={isActive(item.path) ? 'default' : 'ghost'}
							className={`
         w-full justify-start
         ${mobile ? 'h-12 gap-3 text-base' : `gap-2`}
       `}
							size={mobile ? 'default' : 'sm'}
						>
							<Link to={item.path}>
								<Icon className={mobile ? 'size-5' : 'size-4'} />
								{item.label}
							</Link>
						</Button>
					);
				})}
			</div>
		</nav>
	);
}

import { Link, useLocation } from 'react-router-dom';

import { Button } from '@framework/components/primitives/Button';
import { type LucideIcon } from 'lucide-react';

export type NavItemRegular = {
	path: string;
	label: string;
	icon: LucideIcon;
};

export type NavItemSeparator = {
	type: 'separator';
};

export type NavItem = NavItemRegular | NavItemSeparator;

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
				{items.map((item, index) => {
					// Check if this is a separator
					if ('type' in item && item.type === 'separator') {
						return <div key={`separator-${index}`} className="my-2 border-t border-border" />;
					}

					// Regular nav item - TypeScript knows this is NavItemRegular after the guard above
					const regularItem = item as NavItemRegular;
					const Icon = regularItem.icon;
					return (
						<Button
							key={regularItem.path}
							asChild
							variant={isActive(regularItem.path) ? 'default' : 'ghost'}
							className={`
         w-full justify-start
         ${mobile ? 'h-12 gap-3 text-base' : `gap-2`}
       `}
							size={mobile ? 'default' : 'sm'}
						>
							<Link to={regularItem.path}>
								<Icon className={mobile ? 'size-5' : 'size-4'} />
								{regularItem.label}
							</Link>
						</Button>
					);
				})}
			</div>
		</nav>
	);
}

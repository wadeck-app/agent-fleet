import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@framework/components/primitives/Button';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';

export type NavItemRegular = {
	path: string;
	label: string;
	icon: LucideIcon;
};

export type NavItemSeparator = {
	type: 'separator';
};

export type NavItemGroup = {
	type: 'group';
	label: string;
	icon: LucideIcon;
	items: NavItemRegular[];
	defaultOpen?: boolean;
};

export type NavItem = NavItemRegular | NavItemSeparator | NavItemGroup;

interface SidebarNavProps {
	items: NavItem[];
	className?: string;
	mobile?: boolean;
}

export function SidebarNav({ items, className, mobile = false }: SidebarNavProps) {
	const location = useLocation();

	// Track expanded state for each group by index
	const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>(() => {
		const initial: Record<number, boolean> = {};
		items.forEach((item, index) => {
			if ('type' in item && item.type === 'group') {
				initial[index] = item.defaultOpen ?? false;
			}
		});
		return initial;
	});

	// @formatter:off
	// Check if current path matches exactly or starts with path followed by '/' to handle nested routes
	// This prevents false positives like '/ingredients' matching '/ingredients2'
	const isActive = (path: string) => {
		const currentPath = location.pathname;
		return currentPath === path || currentPath.startsWith(path + '/');
	};
	// @formatter:on

	const toggleGroup = (index: number) => {
		setExpandedGroups(prev => ({ ...prev, [index]: !prev[index] }));
	};

	// Check if any child of a group is active
	const hasActiveChild = (items: NavItemRegular[]) => {
		return items.some(item => isActive(item.path));
	};

	return (
		<nav className={className}>
			<div className="space-y-2">
				{items.map((item, index) => {
					// Check if this is a separator
					if ('type' in item && item.type === 'separator') {
						return (
							<div
								key={`separator-${index}`}
								className={`
        my-2 border-t border-border
      `}
							/>
						);
					}

					// Check if this is a group
					if ('type' in item && item.type === 'group') {
						const groupItem = item as NavItemGroup;
						const Icon = groupItem.icon;
						const isExpanded = expandedGroups[index];
						const groupHasActiveChild = hasActiveChild(groupItem.items);
						const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

						return (
							<div key={`group-${index}`}>
								<Button
									variant="ghost"
									className={`
                   w-full justify-start
                   ${mobile ? 'h-12 gap-3 text-base' : 'gap-2'}
                   ${groupHasActiveChild ? 'bg-accent/20' : ''}
                 `}
									size={mobile ? 'default' : 'sm'}
									onClick={() => toggleGroup(index)}
								>
									<Icon className={mobile ? 'size-5' : 'size-4'} />
									{groupItem.label}
									<ChevronIcon className={`ml-auto ${mobile ? 'size-5' : 'size-4'}`} />
								</Button>
								{isExpanded && (
									<div className={`${mobile ? 'ml-8 mt-1' : 'ml-6 mt-1'} space-y-1`}>
										{groupItem.items.map(childItem => {
											const ChildIcon = childItem.icon;
											return (
												<Button
													key={childItem.path}
													asChild
													variant={isActive(childItem.path) ? 'default' : 'ghost'}
													className={`
                             w-full justify-start
                             ${mobile ? 'h-11 gap-3 text-base' : 'gap-2'}
                           `}
													size={mobile ? 'default' : 'sm'}
												>
													<Link to={childItem.path}>
														<ChildIcon className={mobile ? 'size-4' : 'size-3.5'} />
														{childItem.label}
													</Link>
												</Button>
											);
										})}
									</div>
								)}
							</div>
						);
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

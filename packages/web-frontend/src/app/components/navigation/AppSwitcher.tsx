interface AppSwitcherProps {
	className?: string;
	compact?: boolean;
}

/**
 * AppSwitcher - Application Title Display
 *
 * Displays the application name "Agent Fleet" in the sidebar.
 * Simplified from dropdown implementation as there's only one app currently.
 *
 * @param compact - If true, uses smaller text size (mobile variant)
 */
export function AppSwitcher({ className, compact = false }: AppSwitcherProps) {
	return (
		<div className={`flex items-center ${className || ''}`}>
			<h1 className={`font-bold text-primary ${compact ? 'text-lg' : 'text-xl'}`}>Agent Fleet</h1>
		</div>
	);
}

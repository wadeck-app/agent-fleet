import React from 'react';

import { Button } from '@framework/components/primitives/Button';
import { Moon, Sun } from 'lucide-react';

/**
 * ===========================================================================================
 * THEME TOGGLE - UI Component for Theme Switching
 * ===========================================================================================
 *
 * Button component for toggling between light and dark themes.
 * - Zero business logic
 * - Uses shadcn Button component (Radix Nova style)
 * - Lucide icons (Sun/Moon)
 * - Accessible (ARIA labels, keyboard navigation)
 *
 * ===========================================================================================
 */

export interface ThemeToggleProps {
	theme: 'light' | 'dark';
	onToggle: () => void;
	className?: string;
}

export function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
	const isDark = theme === 'dark';

	return (
		<Button
			type="button"
			onClick={onToggle}
			variant="ghost"
			size="icon"
			className={className}
			aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
			title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			{isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
		</Button>
	);
}

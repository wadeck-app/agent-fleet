import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Moon, Sun } from 'lucide-react';

import type { ThemeToggleEnhancedProps } from './ThemeToggleEnhanced';

/**
 * Compact toggle with animation
 */
export function ThemeToggleAnimated({ theme, onToggle, className }: Omit<ThemeToggleEnhancedProps, 'variant'>) {
	const isDark = theme === 'dark';

	return (
		<Button
			type="button"
			onClick={onToggle}
			variant="ghost"
			size="icon"
			className={cn('relative overflow-hidden', className)}
			aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
		>
			<div className="relative size-5">
				<Sun
					className={cn('absolute inset-0 scale-100 rotate-0 transition-all', isDark && `scale-0 rotate-90`)}
				/>
				<Moon
					className={cn('absolute inset-0 scale-0 rotate-90 transition-all', isDark && `scale-100 rotate-0`)}
				/>
			</div>
		</Button>
	);
}

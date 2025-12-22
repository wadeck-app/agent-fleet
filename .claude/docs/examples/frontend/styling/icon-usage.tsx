// @ts-nocheck - Example code, not compiled
// Lucide Icons Usage Patterns
// All icons from lucide-react package
import * as React from 'react';

import {
	AlertCircle,
	AlertTriangle,
	Calendar,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Clock,
	Copy,
	Download,
	Edit,
	ExternalLink,
	Eye,
	EyeOff,
	Filter,
	Heart,
	Home,
	Info,
	Loader2,
	Mail,
	Minus,
	Phone,
	Plus,
	Search,
	Settings,
	Share2,
	Star,
	Trash2,
	Upload,
	User,
	X,
	XCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Basic Icon Usage
 * - Import from 'lucide-react'
 * - Use className for sizing and colors
 * - Default size is 24x24px
 */

export function BasicIconExamples() {
	return (
		<div className="flex items-center gap-4">
			{/* Default size (24x24) */}
			<Check />

			{/* Small size (16x16) */}
			<Check className="h-4 w-4" />

			{/* Medium size (20x20) */}
			<Check className="h-5 w-5" />

			{/* Large size (24x24) */}
			<Check className="h-6 w-6" />

			{/* Extra large (32x32) */}
			<Check className="h-8 w-8" />
		</div>
	);
}

/**
 * Icon Colors with Theme
 * - Use theme colors for consistency
 * - Supports dark mode automatically
 */

export function IconColors() {
	return (
		<div className="flex items-center gap-4">
			{/* Foreground color (default) */}
			<Check className="h-5 w-5 text-foreground" />

			{/* Muted foreground */}
			<Check className="h-5 w-5 text-muted-foreground" />

			{/* Primary color */}
			<Check className="h-5 w-5 text-primary" />

			{/* Success (green) */}
			<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />

			{/* Warning (yellow) */}
			<AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />

			{/* Error (red) */}
			<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />

			{/* Info (blue) */}
			<Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
		</div>
	);
}

/**
 * Animated Icons
 * - Loading spinners
 * - Transitions
 */

export function AnimatedIcons() {
	return (
		<div className="flex items-center gap-4">
			{/* Spinning loader */}
			<Loader2 className="h-5 w-5 animate-spin" />

			{/* With text */}
			<button className="flex items-center gap-2">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span>Loading...</span>
			</button>

			{/* Pulse animation */}
			<Heart className="h-5 w-5 animate-pulse text-red-500" />
		</div>
	);
}

/**
 * Icons in Buttons
 * - Leading icons
 * - Trailing icons
 * - Icon-only buttons
 */

export function IconButtons() {
	return (
		<div className="flex flex-col gap-4">
			{/* Leading icon */}
			<button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
				<Download className="h-4 w-4" />
				Download
			</button>

			{/* Trailing icon */}
			<button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
				Continue
				<ChevronRight className="h-4 w-4" />
			</button>

			{/* Icon only button */}
			<button className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
				<Settings className="h-5 w-5" />
			</button>
		</div>
	);
}

/**
 * Icons in Input Fields
 * - Search inputs
 * - Password toggle
 */

export function IconInputs() {
	const [showPassword, setShowPassword] = React.useState(false);

	return (
		<div className="flex flex-col gap-4">
			{/* Search input with leading icon */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search..."
					className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-4 text-sm"
				/>
			</div>

			{/* Password input with toggle */}
			<div className="relative">
				<input
					type={showPassword ? 'text' : 'password'}
					placeholder="Password"
					className="w-full rounded-md border border-input bg-background py-2 pl-4 pr-10 text-sm"
				/>
				<button
					onClick={() => setShowPassword(!showPassword)}
					className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
				>
					{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
				</button>
			</div>
		</div>
	);
}

/**
 * Status Icons with Colors
 * - Success, error, warning, info states
 */

export function StatusIcons() {
	return (
		<div className="flex flex-col gap-4">
			{/* Success */}
			<div className="flex items-center gap-2 text-green-600 dark:text-green-400">
				<CheckCircle2 className="h-5 w-5" />
				<span className="text-sm font-medium">Success message</span>
			</div>

			{/* Error */}
			<div className="flex items-center gap-2 text-red-600 dark:text-red-400">
				<XCircle className="h-5 w-5" />
				<span className="text-sm font-medium">Error message</span>
			</div>

			{/* Warning */}
			<div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
				<AlertTriangle className="h-5 w-5" />
				<span className="text-sm font-medium">Warning message</span>
			</div>

			{/* Info */}
			<div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
				<Info className="h-5 w-5" />
				<span className="text-sm font-medium">Info message</span>
			</div>
		</div>
	);
}

/**
 * Icon Lists
 * - Feature lists
 * - Navigation items
 */

export function IconLists() {
	return (
		<div className="flex flex-col gap-4">
			{/* Feature list */}
			<ul className="space-y-2">
				<li className="flex items-center gap-2">
					<Check className="h-4 w-4 text-green-600" />
					<span className="text-sm">Unlimited projects</span>
				</li>
				<li className="flex items-center gap-2">
					<Check className="h-4 w-4 text-green-600" />
					<span className="text-sm">24/7 support</span>
				</li>
				<li className="flex items-center gap-2">
					<Check className="h-4 w-4 text-green-600" />
					<span className="text-sm">Advanced analytics</span>
				</li>
			</ul>

			{/* Navigation list */}
			<nav className="space-y-1">
				<a
					href="/"
					className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
				>
					<Home className="h-4 w-4" />
					<span>Home</span>
				</a>
				<a
					href="/calendar"
					className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
				>
					<Calendar className="h-4 w-4" />
					<span>Calendar</span>
				</a>
				<a
					href="/settings"
					className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
				>
					<Settings className="h-4 w-4" />
					<span>Settings</span>
				</a>
			</nav>
		</div>
	);
}

/**
 * Common Icon Sizes Reference:
 * - h-3 w-3 (12px) - Extra small, badges
 * - h-4 w-4 (16px) - Small, inline with text
 * - h-5 w-5 (20px) - Medium, default for most UI
 * - h-6 w-6 (24px) - Large, headers, emphasis
 * - h-8 w-8 (32px) - Extra large, hero sections
 *
 * Best Practices:
 * ✅ DO:
 * - Use semantic colors (text-foreground, text-muted-foreground)
 * - Size icons relative to text (h-4 w-4 with text-sm)
 * - Use aria-hidden="true" for decorative icons
 * - Add aria-label for icon-only buttons
 *
 * ❌ AVOID:
 * - Hardcoded colors (use theme colors)
 * - Inconsistent icon sizes in same context
 * - Missing accessibility labels
 */

import { useState } from 'react';

import { Button } from './Button';

interface CopyLinkButtonProps {
	url: string;
	label: string;
	className?: string;
}

/**
 * ===========================================================================================
 * COPY LINK BUTTON
 * ===========================================================================================
 *
 * Generic primitive for copying a URL to clipboard with visual feedback.
 *
 * Features:
 * - Click to copy URL to clipboard
 * - Shows "Copied!" feedback for 2 seconds in title
 * - Displays custom label text
 *
 * Usage:
 * ```tsx
 * <CopyLinkButton
 *   url="https://example.com/page#anchor"
 *   label="2 hours ago"
 *   className="text-xs"
 * />
 * ```
 *
 * ===========================================================================================
 */
export function CopyLinkButton({ url, label, className }: CopyLinkButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleClick = () => {
		void navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<Button
			title={copied ? 'Copied!' : 'Click to copy link'}
			variant="ghost"
			className={className}
			onClick={handleClick}
		>
			{copied ? 'Copied!' : label}
		</Button>
	);
}

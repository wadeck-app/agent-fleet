import { CopyLinkButton } from '@framework/components/primitives/CopyLinkButton';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';

interface CommentPermalinkProps {
	commentId: string;
	createdAt: string;
}

/**
 * ===========================================================================================
 * COMMENT PERMALINK
 * ===========================================================================================
 *
 * Thin wrapper around CopyLinkButton that constructs comment permalink URLs
 * and updates the browser URL hash on click.
 *
 * Features:
 * - Shows relative time (e.g., "2 hours ago")
 * - Click to copy permalink to clipboard
 * - Shows "Copied!" feedback for 2 seconds
 * - Updates URL hash when clicked
 *
 * ===========================================================================================
 */
export function CommentPermalink({ commentId, createdAt }: CommentPermalinkProps) {
	const url = `${window.location.origin}${window.location.pathname}#comment-${commentId}`;

	// Update URL hash when the button is clicked
	const handleClick = () => {
		window.history.pushState(null, '', `#comment-${commentId}`);
	};

	return (
		<div onClick={handleClick}>
			<CopyLinkButton
				url={url}
				label={formatRelativeTime(createdAt)}
				className="h-auto p-0 text-xs text-muted-foreground hover:underline"
			/>
		</div>
	);
}

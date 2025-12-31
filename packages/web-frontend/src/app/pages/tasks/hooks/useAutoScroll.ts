import { useCallback, useEffect, useRef, useState } from 'react';

import type { LogEntry } from '@shared/api/tasks.contract';

/**
 * Hook for smart auto-scroll management
 * - Auto-scrolls to bottom when new logs arrive
 * - Detects when user scrolls up manually and disables auto-scroll
 * - Re-enables auto-scroll when user scrolls back to bottom
 */
export function useAutoScroll(
	logs: LogEntry[],
	containerRef: React.RefObject<HTMLDivElement | null>,
	isRunning: boolean
) {
	const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
	const lastScrollTopRef = useRef(0);
	const logsCountRef = useRef(logs.length);

	// Detect if user scrolled up manually
	const handleScroll = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;

		const { scrollTop, scrollHeight, clientHeight } = container;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

		// User scrolled up → disable auto-scroll
		if (scrollTop < lastScrollTopRef.current && !isAtBottom) {
			setIsAutoScrollEnabled(false);
		}

		// User scrolled to bottom → re-enable auto-scroll
		if (isAtBottom && !isAutoScrollEnabled) {
			setIsAutoScrollEnabled(true);
		}

		lastScrollTopRef.current = scrollTop;
	}, [containerRef, isAutoScrollEnabled]);

	// Auto-scroll when new logs arrive (only if enabled and task is running)
	useEffect(() => {
		if (isAutoScrollEnabled && isRunning && containerRef.current) {
			const newLogsAdded = logs.length > logsCountRef.current;
			if (newLogsAdded) {
				containerRef.current.scrollTo({
					top: containerRef.current.scrollHeight,
					behavior: 'smooth',
				});
			}
		}
		logsCountRef.current = logs.length;
	}, [logs, isAutoScrollEnabled, isRunning, containerRef]);

	// Manual toggle
	const toggleAutoScroll = useCallback(() => {
		setIsAutoScrollEnabled(prev => !prev);
		// If enabling, scroll to bottom immediately
		if (!isAutoScrollEnabled && containerRef.current) {
			containerRef.current.scrollTo({
				top: containerRef.current.scrollHeight,
				behavior: 'smooth',
			});
		}
	}, [isAutoScrollEnabled, containerRef]);

	// Scroll to bottom manually
	const scrollToBottom = useCallback(() => {
		if (containerRef.current) {
			containerRef.current.scrollTo({
				top: containerRef.current.scrollHeight,
				behavior: 'smooth',
			});
			setIsAutoScrollEnabled(true);
		}
	}, [containerRef]);

	return {
		isAutoScrollEnabled,
		handleScroll,
		toggleAutoScroll,
		scrollToBottom,
	};
}

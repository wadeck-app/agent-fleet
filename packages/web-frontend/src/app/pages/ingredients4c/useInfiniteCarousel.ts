/**
 * ===========================================================================================
 * useInfiniteCarousel - Infinite Scroll Hook for Carousel
 * ===========================================================================================
 *
 * Custom hook that manages infinite scroll data loading for horizontal carousel.
 * Accumulates data across multiple pages as user scrolls through carousel.
 *
 * Key Features:
 * - Accumulates data (append mode, not replace)
 * - Detects scroll proximity to end (via Embla scroll event)
 * - Triggers automatic next page load
 * - Prevents duplicate fetches
 * - Resets on query changes (search, sort, filter)
 *
 * Usage:
 * ```tsx
 * const carousel = useCarousel({ itemsPerView: 3 });
 *
 * const {
 *   data,
 *   isLoading,
 *   isLoadingMore,
 *   hasMore,
 *   error
 * } = useInfiniteCarousel({
 *   fetchFn: fetchIngredients,
 *   pageSize: 12,
 *   sortBy: 'name',
 *   sortOrder: 'asc',
 *   search: 'pizza',
 *   emblaApi: carousel.fstate.emblaApi
 * });
 * ```
 *
 * ===========================================================================================
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EmblaCarouselType } from 'embla-carousel';

/**
 * Pagination metadata from backend API response
 */
export interface PaginationData {
	currentPage: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;
}

/**
 * Generic fetch result structure
 */
export interface FetchDataResult<T> {
	items: T[];
	pagination?: PaginationData;
}

/**
 * Hook configuration
 */
export interface UseInfiniteCarouselConfig<T> {
	/** Fetch function that returns paginated data */
	fetchFn: (query: Record<string, unknown>) => Promise<FetchDataResult<T>>;
	/** Items per page to fetch */
	pageSize: number;
	/** Sort field (optional) */
	sortBy?: string;
	/** Sort direction (optional) */
	sortOrder?: 'asc' | 'desc';
	/** Search query (optional) */
	search?: string;
	/** Embla carousel API instance for scroll detection */
	emblaApi: EmblaCarouselType | undefined;
	/** Scroll threshold (0-1) to trigger load. Default: 0.85 (85%) */
	triggerThreshold?: number;
}

/**
 * Hook return value
 */
export interface UseInfiniteCarouselReturn<T> {
	/** Accumulated data from all loaded pages */
	data: T[];
	/** Initial loading state (first page) */
	isLoading: boolean;
	/** Loading more pages (subsequent pages) */
	isLoadingMore: boolean;
	/** Has more pages to load */
	hasMore: boolean;
	/** Error message if fetch failed */
	error: string | null;
	/** Total number of items in the dataset (from backend pagination) */
	totalItems: number;
	/** Manually trigger load next page */
	loadNextPage: () => Promise<void>;
	/** Reset accumulated data and start from page 1 */
	reset: () => void;
}

/**
 * useInfiniteCarousel - Manages infinite scroll data loading
 */
export function useInfiniteCarousel<T>({
	fetchFn,
	pageSize,
	sortBy,
	sortOrder,
	search,
	emblaApi,
	triggerThreshold = 0.85,
}: UseInfiniteCarouselConfig<T>): UseInfiniteCarouselReturn<T> {
	// State
	const [accumulatedData, setAccumulatedData] = useState<T[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [totalItems, setTotalItems] = useState(0);

	// Track loaded pages to prevent duplicates
	const loadedPages = useRef(new Set<number>());

	// Track if component is mounted (prevent state updates after unmount)
	const isMounted = useRef(true);

	// Add comment above the target line, not at the end
	// Build query object from current state
	const buildQuery = useCallback(() => {
		const query: Record<string, unknown> = {
			page: currentPage,
			pageSize,
		};

		if (sortBy) {
			query.sortBy = sortBy;
		}
		if (sortOrder) {
			query.sortOrder = sortOrder;
		}
		if (search) {
			query.search = search;
		}

		return query;
	}, [currentPage, pageSize, sortBy, sortOrder, search]);

	/**
	 * Load a specific page and accumulate data
	 */
	const loadPage = useCallback(
		async (page: number, isInitial: boolean) => {
			// Prevent duplicate fetches
			if (loadedPages.current.has(page)) {
				return;
			}

			// Mark page as loading
			loadedPages.current.add(page);

			// Set loading state
			if (isInitial) {
				setIsLoading(true);
			} else {
				setIsLoadingMore(true);
			}
			setError(null);

			try {
				const query = {
					page,
					pageSize,
					...(sortBy && { sortBy }),
					...(sortOrder && { sortOrder }),
					...(search && { search }),
				};

				const result = await fetchFn(query);

				// Only update state if still mounted
				if (!isMounted.current) return;

				// Accumulate data
				if (isInitial) {
					setAccumulatedData(result.items);
				} else {
					setAccumulatedData(prev => [...prev, ...result.items]);
				}

				// Update pagination state
				if (result.pagination) {
					setHasMore(page < result.pagination.totalPages);
					setCurrentPage(page);
					setTotalItems(result.pagination.totalItems);
				} else {
					// No pagination metadata - assume no more pages
					setHasMore(false);
					setTotalItems(0);
				}
			} catch (err) {
				if (!isMounted.current) return;

				setError(err instanceof Error ? err.message : 'Failed to load data');
				// Remove from loaded pages so user can retry
				loadedPages.current.delete(page);
			} finally {
				if (!isMounted.current) return;

				setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[fetchFn, pageSize, sortBy, sortOrder, search]
	);

	/**
	 * Load next page
	 */
	const loadNextPage = useCallback(async () => {
		if (!hasMore || isLoadingMore) return;

		const nextPage = currentPage + 1;
		await loadPage(nextPage, false);
	}, [hasMore, isLoadingMore, currentPage, loadPage]);

	/**
	 * Reset to initial state
	 */
	const reset = useCallback(() => {
		setAccumulatedData([]);
		setCurrentPage(1);
		setHasMore(true);
		setError(null);
		setTotalItems(0);
		loadedPages.current.clear();
	}, []);

	/**
	 * Reset and load first page when query changes
	 */
	useEffect(() => {
		reset();
		loadPage(1, true);
	}, [sortBy, sortOrder, search, pageSize, reset, loadPage]);

	/**
	 * Scroll detection - load next page when approaching end
	 */
	useEffect(() => {
		if (!emblaApi || !hasMore || isLoadingMore) return;

		const onScroll = () => {
			const scrollProgress = emblaApi.scrollProgress();

			// Trigger load when scroll progress exceeds threshold
			if (scrollProgress >= triggerThreshold) {
				loadNextPage();
			}
		};

		// Listen to scroll events
		emblaApi.on('scroll', onScroll);

		// Check initial position (in case already scrolled)
		onScroll();

		return () => {
			emblaApi.off('scroll', onScroll);
		};
	}, [emblaApi, hasMore, isLoadingMore, triggerThreshold, loadNextPage]);

	/**
	 * Cleanup on unmount
	 */
	useEffect(() => {
		isMounted.current = true;

		return () => {
			isMounted.current = false;
		};
	}, []);

	return {
		data: accumulatedData,
		isLoading,
		isLoadingMore,
		hasMore,
		error,
		totalItems,
		loadNextPage,
		reset,
	};
}

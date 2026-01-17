import { type RefCallback, useCallback, useEffect, useMemo, useState } from 'react';

import type { FeatureContract } from '@framework/types/FeatureContract';
import type { EmblaCarouselType } from 'embla-carousel';
import useEmblaCarousel from 'embla-carousel-react';

/**
 * ===========================================================================================
 * USE CAROUSEL - Headless Composable Carousel Hook
 * ===========================================================================================
 *
 * Carousel feature hook following the FeatureContract pattern.
 * Wraps Embla Carousel with a consistent interface for Data2 integration.
 *
 * Key features:
 * - Returns standardized FeatureContract: { fstate, actions, fillQuery }
 * - fstate (frozen state) for stable useEffect dependencies
 * - All actions grouped in actions object
 * - fillQuery is no-op (carousel is UI-only, doesn't affect backend query)
 *
 * Example usage:
 * ```typescript
 * const carousel = useCarousel({ itemsPerView: 3 });
 *
 * // Access state
 * console.log(carousel.fstate.currentIndex); // 0
 * console.log(carousel.fstate.canScrollPrev); // false
 *
 * // Call actions
 * carousel.actions.scrollNext();
 * carousel.actions.scrollTo(2);
 *
 * // Attach emblaRef to carousel container
 * <div ref={carousel.fstate.emblaRef}>...</div>
 * ```
 *
 * ===========================================================================================
 */

export interface UseCarouselOptions {
	/** Number of items visible at once (e.g., 3 for 3 cards) */
	itemsPerView: number;
	/** Enable loop mode (default: false) */
	loop?: boolean;
	/** Alignment for slides (default: 'start') */
	align?: 'start' | 'center' | 'end';
}

/**
 * State shape for carousel feature.
 * Exported for type-safe consumption in components.
 */
export interface CarouselState {
	/** Current slide index (0-based) */
	currentIndex: number;
	/** Number of items visible at once */
	itemsPerView: number;
	/** Whether we can scroll to previous */
	canScrollPrev: boolean;
	/** Whether we can scroll to next */
	canScrollNext: boolean;
	/** Ref callback to attach to carousel container */
	emblaRef: RefCallback<HTMLDivElement>;
	/** Array of scroll snap positions (for dot indicators) */
	scrollSnaps: number[];
	/** Embla API instance for advanced control */
	emblaApi: EmblaCarouselType | undefined;
}

/**
 * Type alias for carousel feature contract.
 * Ensures type safety when passing carousel feature to components.
 */
export type CarouselContract = FeatureContract<CarouselState>;

/**
 * Headless carousel hook following the FeatureContract pattern.
 * Wraps Embla Carousel for consistent integration with Data2 architecture.
 *
 * @param options - Configuration options
 * @returns CarouselContract with fstate, actions, fillQuery
 */
export function useCarousel(options: UseCarouselOptions): CarouselContract {
	const { itemsPerView, loop = false, align = 'start' } = options;

	// Initialize Embla Carousel
	// Add comment above the target line, not at the end
	// Enable drag with proper touch/mouse handling
	const [emblaRef, emblaApi] = useEmblaCarousel({
		loop,
		align,
		slidesToScroll: 1, // Scroll 1 slide at a time
		containScroll: 'trimSnaps',
		dragFree: false, // Snap to slides
		watchDrag: true, // Enable drag detection
		skipSnaps: false, // Don't skip snap points
	});

	// Carousel state
	const [currentIndex, setCurrentIndex] = useState(0);
	const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
	const [canScrollPrev, setCanScrollPrev] = useState(false);
	const [canScrollNext, setCanScrollNext] = useState(false);

	// Update state when Embla API is ready
	useEffect(() => {
		if (!emblaApi) return;

		// Initialize scroll snaps (positions for dot indicators)
		setScrollSnaps(emblaApi.scrollSnapList());

		// Add comment above the target line, not at the end
		// Update state whenever selection changes
		const onSelect = () => {
			setCurrentIndex(emblaApi.selectedScrollSnap());
			setCanScrollPrev(emblaApi.canScrollPrev());
			setCanScrollNext(emblaApi.canScrollNext());
		};

		// Listen to selection changes
		emblaApi.on('select', onSelect);
		emblaApi.on('reInit', onSelect);

		// Initial state
		onSelect();

		return () => {
			emblaApi.off('select', onSelect);
			emblaApi.off('reInit', onSelect);
		};
	}, [emblaApi]);

	// Frozen state (memoized, stable reference for useEffect deps)
	const fstate = useMemo(
		() => ({
			currentIndex,
			itemsPerView,
			canScrollPrev,
			canScrollNext,
			emblaRef,
			scrollSnaps,
			emblaApi,
		}),
		[currentIndex, itemsPerView, canScrollPrev, canScrollNext, emblaRef, scrollSnaps, emblaApi]
	);

	// Actions (all state-modifying functions)
	const actions = useMemo(
		() => ({
			scrollPrev: () => emblaApi?.scrollPrev(),
			scrollNext: () => emblaApi?.scrollNext(),
			scrollTo: (index: number) => emblaApi?.scrollTo(index),
		}),
		[emblaApi]
	);

	// Fill backend query parameters
	// Carousel is UI-only, doesn't affect backend query
	const fillQuery = useCallback(() => {
		// No-op: carousel state doesn't affect backend query
	}, []);

	return {
		fstate,
		actions,
		fillQuery,
	};
}

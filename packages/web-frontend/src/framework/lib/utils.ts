import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

//FIXME rename file to cn.ts

/**
 * Combines class names using clsx and tailwind-merge.
 * This utility merges Tailwind CSS classes intelligently, handling conflicts.
 *
 * @param inputs - Class names to combine
 * @returns Merged class string
 *
 * @example
 * ```ts
 * cn('px-2 py-1', 'px-4') // => 'py-1 px-4'
 * cn('text-red-500', condition && 'text-blue-500') // conditional classes
 * ```
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

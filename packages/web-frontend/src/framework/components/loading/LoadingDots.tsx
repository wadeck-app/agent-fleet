/**
 * LoadingDots - For large area loading states
 *
 * Use cases:
 * - Full page loading (while fetching initial data)
 * - Table body loading states (entire table)
 * - Large content area loading
 * - Dashboard/panel loading
 *
 * For small elements (buttons, rows), use LoadingSpinner instead.
 *
 * @example
 * {loading ? (
 *   <LoadingDots size="large" />
 * ) : (
 *   <Table data={data} />
 * )}
 */

export type LoadingDotsSize = 'small' | 'medium' | 'large';

export interface LoadingDotsProps {
	size?: LoadingDotsSize;
	className?: string;
}

const gapClasses: Record<LoadingDotsSize, string> = {
	small: 'gap-0.5',
	medium: 'gap-1.5',
	large: 'gap-2',
};

const dotClasses: Record<LoadingDotsSize, string> = {
	small: 'w-1.5 h-1.5',
	medium: 'w-2.5 h-2.5',
	large: 'w-4 h-4',
};

export function LoadingDots({ size = 'medium', className = '' }: LoadingDotsProps) {
	return (
		<span
			className={`
     inline-flex items-center
     ${gapClasses[size]}
     ${className}
   `}
		>
			<span
				className={`
      ${dotClasses[size]}
      animate-typing-dot rounded-full bg-current
      [animation-delay:0s]
    `}
			/>
			<span
				className={`
      ${dotClasses[size]}
      animate-typing-dot rounded-full bg-current
      [animation-delay:0.2s]
    `}
			/>
			<span
				className={`
      ${dotClasses[size]}
      animate-typing-dot rounded-full bg-current
      [animation-delay:0.4s]
    `}
			/>
		</span>
	);
}

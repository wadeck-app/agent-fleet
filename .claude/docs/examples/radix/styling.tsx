/**
 * RADIX UI STYLING WITH TAILWIND
 *
 * How to style Radix components using Tailwind classes and data attributes.
 */
import * as Accordion from '@radix-ui/react-accordion';
import * as Dialog from '@radix-ui/react-dialog';

// ==================== DATA ATTRIBUTES ====================

/**
 * Radix exposes component state via data attributes:
 *
 * - data-state="open" / data-state="closed"
 * - data-disabled
 * - data-highlighted
 * - data-selected
 * - data-orientation="horizontal" / "vertical"
 *
 * Use Tailwind's data-[] modifier to style based on state.
 */

// ==================== EXAMPLE 1: Dialog with Animations ====================

function StyledDialog() {
	return (
		<Dialog.Root>
			<Dialog.Trigger className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
				Open Dialog
			</Dialog.Trigger>

			<Dialog.Portal>
				{/* ✅ Overlay: Fade in/out based on state */}
				<Dialog.Overlay
					className="
            fixed inset-0 bg-black/50
            data-[state=open]:animate-fadeIn
            data-[state=closed]:animate-fadeOut
          "
				/>

				{/* ✅ Content: Slide in/out based on state */}
				<Dialog.Content
					className="
            fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            bg-white rounded-lg shadow-xl p-6 w-full max-w-md
            data-[state=open]:animate-slideIn
            data-[state=closed]:animate-slideOut
          "
				>
					<Dialog.Title className="text-xl font-semibold">Styled Dialog</Dialog.Title>
					<Dialog.Description className="text-gray-600 mt-2">
						This dialog uses Tailwind animations based on Radix data attributes.
					</Dialog.Description>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

// ==================== EXAMPLE 2: Accordion with State Styling ====================

function StyledAccordion() {
	return (
		<Accordion.Root type="single" collapsible className="w-full">
			<Accordion.Item value="item-1" className="border-b border-gray-200">
				{/* ✅ Trigger: Rotate chevron based on state */}
				<Accordion.Header>
					<Accordion.Trigger
						className="
              flex w-full items-center justify-between py-4 px-2
              hover:bg-gray-50 transition-colors
              group
            "
					>
						<span className="font-medium">Is it accessible?</span>
						<svg
							className="
                w-5 h-5 transition-transform duration-200
                data-[state=open]:rotate-180
              "
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</Accordion.Trigger>
				</Accordion.Header>

				{/* ✅ Content: Animate height based on state */}
				<Accordion.Content
					className="
            overflow-hidden
            data-[state=open]:animate-slideDown
            data-[state=closed]:animate-slideUp
          "
				>
					<div className="px-2 py-4 text-gray-600">
						Yes. It adheres to the WAI-ARIA design patterns.
					</div>
				</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	);
}

// ==================== EXAMPLE 3: Responsive Styling ====================

function ResponsiveDialog() {
	return (
		<Dialog.Root>
			<Dialog.Trigger className="btn-primary">Open</Dialog.Trigger>

			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 bg-black/50" />

				{/* ✅ Responsive: Full screen on mobile, modal on desktop */}
				<Dialog.Content
					className="
            fixed
            inset-0 sm:inset-auto
            sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
            bg-white p-6
            w-full sm:w-auto sm:max-w-md sm:rounded-lg
            data-[state=open]:animate-slideIn
          "
				>
					<Dialog.Title className="text-xl font-semibold">Responsive Dialog</Dialog.Title>
					<Dialog.Description className="text-gray-600 mt-2">
						Full screen on mobile, modal on desktop.
					</Dialog.Description>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

// ==================== EXAMPLE 4: Focus States ====================

function FocusStyledButton() {
	return (
		<button
			className="
        px-4 py-2 bg-blue-500 text-white rounded-lg
        hover:bg-blue-600
        focus:outline-none focus:ring-4 focus:ring-blue-300
        active:bg-blue-700
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all
      "
		>
			Styled Button
		</button>
	);
}

// ==================== TAILWIND CONFIG FOR ANIMATIONS ====================

/**
 * Add these animations to your tailwind.config.js:
 *
 * module.exports = {
 *   theme: {
 *     extend: {
 *       keyframes: {
 *         fadeIn: {
 *           from: { opacity: '0' },
 *           to: { opacity: '1' },
 *         },
 *         fadeOut: {
 *           from: { opacity: '1' },
 *           to: { opacity: '0' },
 *         },
 *         slideIn: {
 *           from: { transform: 'translateX(-100%) translateY(-50%)' },
 *           to: { transform: 'translateX(-50%) translateY(-50%)' },
 *         },
 *         slideOut: {
 *           from: { transform: 'translateX(-50%) translateY(-50%)' },
 *           to: { transform: 'translateX(100%) translateY(-50%)' },
 *         },
 *         slideDown: {
 *           from: { height: '0' },
 *           to: { height: 'var(--radix-accordion-content-height)' },
 *         },
 *         slideUp: {
 *           from: { height: 'var(--radix-accordion-content-height)' },
 *           to: { height: '0' },
 *         },
 *       },
 *       animation: {
 *         fadeIn: 'fadeIn 200ms ease-out',
 *         fadeOut: 'fadeOut 200ms ease-in',
 *         slideIn: 'slideIn 200ms ease-out',
 *         slideOut: 'slideOut 200ms ease-in',
 *         slideDown: 'slideDown 200ms ease-out',
 *         slideUp: 'slideUp 200ms ease-in',
 *       },
 *     },
 *   },
 * };
 */

/**
 * KEY PATTERNS:
 *
 * 1. DATA ATTRIBUTES:
 *    - Use data-[state=*] for state-based styling
 *    - data-[disabled] for disabled states
 *    - data-[highlighted] for hover/focus states
 *
 * 2. ANIMATIONS:
 *    - Define in Tailwind config
 *    - Apply with data-[state=*]:animate-*
 *    - Use Radix CSS variables for dynamic values
 *
 * 3. RESPONSIVE:
 *    - Use Tailwind responsive prefixes (sm:, md:, lg:)
 *    - Full screen on mobile, modal on desktop
 *
 * 4. FOCUS STATES:
 *    - Always style focus states
 *    - Use focus:ring for visibility
 *    - Remove default outline with focus:outline-none
 *
 * BENEFITS:
 * - Smooth animations
 * - State-driven styling
 * - Responsive design
 * - Accessible focus states
 * - Consistent with Tailwind patterns
 */

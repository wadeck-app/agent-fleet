import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const KEY_STEP = 16;
// Written out in full: Tailwind finds classes by scanning source text. Hidden below lg, where the panel is not a drawer.
const HANDLE_CLASS =
	'hidden touch-none cursor-col-resize rounded bg-border opacity-0 hover:opacity-100 focus-visible:opacity-100 lg:absolute lg:inset-y-0 lg:left-0 lg:z-10 lg:block lg:w-1.5';
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface DrawerResizeHandleProps {
	/** Width of the drawer in px. */
	value: number;
	min: number;
	max: number;
	onChange: (value: number) => void;
}

/**
 * The left edge of a drawer docked on the right: dragging it to the left (or the left arrow) widens the drawer.
 * A separator that takes the focus, so the width can be set without a pointer.
 */
export function DrawerResizeHandle({ value, min, max, onChange }: DrawerResizeHandleProps) {
	const drag = useRef<{ startX: number; startValue: number } | undefined>(undefined);
	// The window listeners read the latest bounds and callback without being re-registered on each render.
	const latest = useRef({ min, max, onChange });
	latest.current = { min, max, onChange };
	useEffect(() => {
		const move = (event: PointerEvent) => {
			if (drag.current === undefined) {
				return;
			}
			const next = drag.current.startValue + (drag.current.startX - event.clientX);
			latest.current.onChange(clamp(next, latest.current.min, latest.current.max));
		};
		const stop = () => {
			drag.current = undefined;
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop);
		window.addEventListener('pointercancel', stop);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
			window.removeEventListener('pointercancel', stop);
		};
	}, []);
	const onPointerDown = (event: ReactPointerEvent) => {
		event.preventDefault();
		drag.current = { startX: event.clientX, startValue: value };
	};
	const onKeyDown = (event: KeyboardEvent) => {
		const targets: Record<string, number> = {
			ArrowLeft: value + KEY_STEP,
			ArrowRight: value - KEY_STEP,
			Home: min,
			End: max,
		};
		const target = targets[event.key];
		if (target !== undefined) {
			event.preventDefault();
			onChange(clamp(target, min, max));
		}
	};
	return (
		<div
			role="separator"
			aria-label="Resize the step panel"
			aria-orientation="vertical"
			aria-valuenow={value}
			aria-valuemin={min}
			aria-valuemax={max}
			tabIndex={0}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			className={HANDLE_CLASS}
		/>
	);
}

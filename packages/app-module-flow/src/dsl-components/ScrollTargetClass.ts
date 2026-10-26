/**
 * Scroll margin of an element the step index scrolls to: the shell top bar is sticky and publishes its height in
 * `--app-shell-bar-height` (0px outside the shell), so a target scrolled to the viewport top would sit under it.
 * Written out in full: Tailwind finds classes by scanning source text.
 */
export const SCROLL_TARGET_CLASS = 'scroll-mt-[calc(var(--app-shell-bar-height,0px)+0.5rem)]';

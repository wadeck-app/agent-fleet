import { useEffect, useState } from 'react';

export type ShellColorMode = 'light' | 'dark';

function currentMode(): ShellColorMode {
	return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * The theme of the app-core shell (the `dark` class on <html>). xyflow tags its root with a `light` or `dark`
 * class, and the shell scopes its color tokens on those class names: an xyflow root saying `light` inside a dark
 * shell would bring the light tokens back, so the chart must say the same as the shell.
 */
export function useShellColorMode(): ShellColorMode {
	const [mode, setMode] = useState<ShellColorMode>(currentMode);
	useEffect(() => {
		const observer = new MutationObserver(() => setMode(currentMode()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		setMode(currentMode());
		return () => observer.disconnect();
	}, []);
	return mode;
}

/**
 * Single definition of the `$${{ ... }}` escape (a literal `${{ ... }}` in the rendered output).
 *
 * Shared by TemplateRenderer (runtime) and every validator that scans templates, so that
 * `flow validate` skips exactly what the renderer leaves unevaluated.
 */
export class TemplateEscape {
	/** Fresh global regex matching `$${{ ... }}` (new instance per call: no shared lastIndex state). */
	public static pattern(): RegExp {
		return /\$\$\{\{(.*?)\}\}/g;
	}

	/** Remove every escaped literal so remaining `${{ ... }}` occurrences are real expressions. */
	public static strip(text: string): string {
		return text.replace(TemplateEscape.pattern(), '');
	}
}

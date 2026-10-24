// Only these schemes may be followed from a log line: the text is data of a run, not something the shell should execute.
const ALLOWED_SCHEMES = ['https://', 'http://', 'mailto:'];

/**
 * The target of a markdown link when it is safe to follow, '' otherwise (javascript:, data:, vbscript:, file:, relative
 * paths and anchors, which would navigate inside the shell). Blanks and control characters are refused outright:
 * browsers drop them inside a scheme ("java<tab>script:"), and a well-formed target never has any.
 */
export function safeLinkTarget(target: string): string {
	for (const char of target) {
		const code = char.charCodeAt(0);
		if (code <= 0x20 || code === 0x7f) {
			return '';
		}
	}
	const lower = target.toLowerCase();
	return ALLOWED_SCHEMES.some(scheme => lower.startsWith(scheme)) ? target : '';
}

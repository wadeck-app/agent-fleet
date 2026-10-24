export function parseWorkerLabels(raw: string | undefined): string[] {
	if (raw === undefined || raw.trim() === '') {
		return [];
	}
	return raw.split(',').map(label => label.trim());
}

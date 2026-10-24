import { useSearchParams } from 'react-router-dom';

export interface UrlLogFilter {
	/** The `step` URL parameter, null when absent. */
	step: string | null;
	level: string | null;
	setStep: (stepId: string | null) => void;
	setLevel: (level: string | null) => void;
}

/**
 * The step and level filters of the page, which live in the URL (`?step=` and `?level=`, the same parameters the
 * selects above write and the route reads). A change goes back to the first page like the selects do, and keeps the
 * other parameters (text, page size).
 */
export function useUrlLogFilter(): UrlLogFilter {
	const [params, setParams] = useSearchParams();
	const change = (name: string, value: string | null): void => {
		setParams(previous => {
			const next = new URLSearchParams(previous);
			if (value === null) {
				next.delete(name);
			} else {
				next.set(name, value);
			}
			next.delete('page');
			return next;
		});
	};
	return {
		step: params.get('step'),
		level: params.get('level'),
		setStep: stepId => change('step', stepId),
		setLevel: level => change('level', level),
	};
}

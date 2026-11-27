import { InvalidQueryError } from 'flow-core';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

/** The value of a date option (`--since`, `--before`): an ISO date (UTC midnight) or datetime (UTC when it has no offset). */
export class IsoDateOption {
	/**
	 * @param optionName - the option as typed by the user (e.g. `--before`), named in the error
	 * @returns epoch milliseconds
	 * @throws InvalidQueryError naming the option, the value and an example.
	 */
	static parse(value: string, optionName: string): number {
		const fail = (): never => {
			throw new InvalidQueryError(
				`Invalid ${optionName} "${value}": expected an ISO date or datetime, e.g. ${optionName} 2026-11-01 or ${optionName} 2026-11-01T08:30:00Z.`
			);
		};
		const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(value);
		if (!DATE_ONLY.test(value) && !DATE_TIME.test(value)) {
			return fail();
		}
		const time = Date.parse(DATE_ONLY.test(value) || hasOffset ? value : `${value}Z`);
		if (Number.isNaN(time)) {
			return fail();
		}
		// Date silently rolls 2026-02-31 over to March: refuse it instead.
		if (DATE_ONLY.test(value) && new Date(time).toISOString().slice(0, 10) !== value) {
			return fail();
		}
		return time;
	}
}

/**
 * Runs async operations one after the other, in call order. A failing operation rejects its own caller
 * and does not stop the queue.
 */
export class SerialQueue {
	private tail: Promise<unknown> = Promise.resolve();

	run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation);
		this.tail = result.catch(() => undefined);
		return result;
	}
}

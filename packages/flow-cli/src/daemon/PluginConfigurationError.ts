/**
 * A problem the USER can fix in how a built-in worker type was declared (a bad option, a bad URL), as opposed to a bug of
 * flow or a wiring mistake of the daemon. Its message already says what is wrong and how to fix it; the failure builder
 * shows it as a configuration error and does not ask for a bug report.
 *
 * flow-cli internal, deliberately not part of worker-type/v1: a plugin loaded from a directory cannot import it, and an
 * error that merely carries its name is not honoured (see WorkerTypeFailures).
 */
export class PluginConfigurationError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'PluginConfigurationError';
	}
}

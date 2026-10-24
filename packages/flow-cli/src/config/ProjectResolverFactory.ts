import { DefaultProjectResolver } from './DefaultProjectResolver.js';

/**
 * The single place that decides which project resolver flow-cli uses.
 *
 * The `project-resolution` extension point is declared but no config key selects an
 * implementation yet, so this returns the built-in one. When a selection mechanism exists
 * (it is a spec question, see D#15), it is wired here and every call site follows.
 */
export class ProjectResolverFactory {
	static create(): DefaultProjectResolver {
		return new DefaultProjectResolver();
	}
}

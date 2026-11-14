import type { HostTool, HostToolArg } from './HostToolTypes';

/** One tool as the model sees it: no command, no environment, no working directory. */
export interface HostToolModelDescription {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/**
 * What the model is told about the host tools of a step, and what the VM-side MCP server receives (`FLOW_MCP_TOOLS`).
 * The command never leaves the worker's host: only names, descriptions and argument schemas are serialized here.
 * Assumes tools that passed {@link HostToolValidator}.
 */
export class HostToolModelView {
	static describe(tool: HostTool): HostToolModelDescription {
		const args = Object.entries(tool.args ?? {});
		const summary =
			args.length === 0 ? 'none' : args.map(([name, arg]) => HostToolModelView.summarise(name, arg)).join(', ');
		const properties: Record<string, unknown> = {};
		const required: string[] = [];
		for (const [name, arg] of args) {
			properties[name] = HostToolModelView.schemaOf(arg);
			if (arg.required === true) {
				required.push(name);
			}
		}
		return {
			name: tool.id,
			description: `${tool.description} (side effect: ${tool.sideEffect}; runs on the host; arguments: ${summary})`,
			inputSchema: {
				type: 'object',
				properties,
				...(required.length > 0 ? { required } : {}),
				additionalProperties: false,
			},
		};
	}

	/** The JSON for `FLOW_MCP_TOOLS`: the descriptions of the tools, in declaration order. */
	static serialize(tools: readonly HostTool[]): string {
		return JSON.stringify(tools.map(tool => HostToolModelView.describe(tool)));
	}

	/** Size of {@link serialize} in bytes (UTF-8), the figure the per-step cap is checked against. */
	static byteLength(tools: readonly HostTool[]): number {
		return Buffer.byteLength(HostToolModelView.serialize(tools), 'utf8');
	}

	private static summarise(name: string, arg: HostToolArg): string {
		const detail = ((): string => {
			switch (arg.type) {
				case 'enum':
					return `enum: ${arg.values.join('|')}`;
				case 'string':
					return 'string';
				case 'integer':
					return `integer ${arg.min}..${arg.max}`;
				case 'boolean':
					return 'boolean';
				default:
					throw new Error(`Unhandled host tool argument type '${(arg as { type: string }).type}'`);
			}
		})();
		return `${name} (${detail}${arg.required === true ? ', required' : ''})`;
	}

	private static schemaOf(arg: HostToolArg): Record<string, unknown> {
		const description = arg.description === undefined ? {} : { description: arg.description };
		switch (arg.type) {
			case 'enum':
				return { type: 'string', enum: arg.values, ...description };
			case 'string':
				return { type: 'string', pattern: arg.pattern, ...description };
			case 'integer':
				return { type: 'integer', minimum: arg.min, maximum: arg.max, ...description };
			case 'boolean':
				return { type: 'boolean', ...description };
			default:
				throw new Error(`Unhandled host tool argument type '${(arg as { type: string }).type}'`);
		}
	}
}

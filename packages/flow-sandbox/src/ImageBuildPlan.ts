import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The commands `image/build-image.mjs` runs in the builder sandbox, as ARGUMENT LISTS (no shell, no quoting): the paths
 * come from the host temp directory, whose name contains the user name, and a quote in it must not break or inject.
 * Also the check that the generated bundles the Dockerfile copies exist before anything is created.
 */
export class ImageBuildPlan {
	/** The files of /opt/flow built by scripts/BuildInnerBundles.mjs (the forwarder is source-controlled). */
	static readonly BUNDLES = ['worker.cjs', 'mcp-server.cjs', 'inner-bridge.cjs'] as const;

	/** Throws, naming what is missing and the command that builds it, unless every bundle is in `optFlowDirectory`. */
	static assertBundles(optFlowDirectory: string): void {
		const missing = ImageBuildPlan.BUNDLES.filter(file => !fs.existsSync(path.join(optFlowDirectory, file)));
		if (missing.length > 0) {
			throw new Error(
				`${missing.join(', ')} not found in ${optFlowDirectory}. They are build output: run \`node --import tsx packages/flow-sandbox/scripts/BuildInnerBundles.mjs\` from the repository root, then build the image again.`
			);
		}
	}

	static build(tag: string, contextInVm: string): string[] {
		return ['docker', 'build', '-t', tag, contextInVm];
	}

	static inspectId(tag: string): string[] {
		return ['docker', 'image', 'inspect', '--format', '{{.Id}}', tag];
	}

	static save(tag: string, tarInVm: string): string[] {
		return ['docker', 'save', tag, '-o', tarInVm];
	}

	static readManifest(tarInVm: string): string[] {
		return ['tar', '-xOf', tarInVm, 'manifest.json'];
	}
}

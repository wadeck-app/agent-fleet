import { describeError } from '../ErrorText';
import type { SandboxLog } from '../SandboxLog';
import { SandboxOptionsParser } from '../SandboxOptionsParser';
import type { PrerequisiteReport } from '../SbxPrerequisiteCheck';

/** The rows of `sbx template ls`: `<repository> <tag> <id> ...`, the repository possibly with registry and namespace. */
export class SbxTemplateListing {
	static has(listing: string, tag: string): boolean {
		const [repository = '', version = ''] = tag.split(':');
		return listing.split('\n').some(line => {
			const columns = line.trim().split(/\s+/);
			// The real sbx prints the full name (docker.io/library/flow-sandbox): a short name matches its last path segments.
			const named = columns[0] === repository || (columns[0] ?? '').endsWith(`/${repository}`);
			return named && columns[1] === version;
		});
	}
}

export interface WrapperPreflightDependencies {
	/** SbxPrerequisiteCheck over the real runtime (binary, version, daemon, sign-in, policy, ssh setting). */
	prerequisites: () => Promise<PrerequisiteReport>;
	/** The text of `sbx template ls`. */
	templateListing: () => Promise<string>;
	log: SandboxLog;
}

/** The part of the wrapper configuration the preflight needs. */
export interface PreflightConfig {
	image: string | undefined;
	cpus: number;
	memory: string;
	idleStopMinutes: number;
	maxConcurrentSandboxes: number;
	profileAlias: string;
	hostProfile: string;
	extraAllowedHosts: readonly string[];
	acceptSshAgentForwarding: boolean;
}

/**
 * `wrapper.cjs preflight <options>`: what the sandbox plugin asks before it builds a source, so that a machine that cannot run
 * sandboxes fails when the source is first used, with the fix, and not at the first step. Runs no sandbox.
 * - the options go through the package's own SandboxOptionsParser (memory, hosts, ranges);
 * - sbx must be installed at the pinned version and signed in (SbxPrerequisiteCheck, every error says what to run);
 * - the image, when one is configured, must be known to `sbx template ls` (best effort: a listing that cannot be read is a warning).
 */
export class WrapperPreflight {
	constructor(private readonly dependencies: WrapperPreflightDependencies) {}

	async run(config: PreflightConfig): Promise<void> {
		const { prerequisites, templateListing, log } = this.dependencies;
		new SandboxOptionsParser().parse({
			cpus: config.cpus,
			memory: config.memory,
			maxConcurrentSandboxes: config.maxConcurrentSandboxes,
			idleStopMinutes: config.idleStopMinutes,
			profiles: { [config.profileAlias]: config.hostProfile },
			extraAllowedHosts: [...config.extraAllowedHosts],
			...(config.image === undefined ? {} : { image: config.image }),
			acceptSshAgentForwarding: config.acceptSshAgentForwarding,
		});

		const report = await prerequisites();
		for (const finding of report.findings) {
			if (finding.severity === 'warning' || finding.severity === 'error')
				log.warn(`${finding.id}: ${finding.message}`);
			else log.info(`${finding.id}: ${finding.message}`);
		}
		if (!report.ok) {
			throw new Error(
				report.findings
					.filter(finding => finding.severity === 'error')
					.map(finding => finding.message)
					.join('\n')
			);
		}

		if (config.image === undefined) return;
		let listing: string;
		try {
			listing = await templateListing();
		} catch (error) {
			log.warn(`could not check whether the image "${config.image}" exists: ${describeError(error)}`);
			return;
		}
		if (!SbxTemplateListing.has(listing, config.image)) {
			throw new Error(
				`The sandbox image "${config.image}" is not known to this machine (sbx template ls). Build and load it with: node --import tsx packages/flow-sandbox/image/build-image.mjs --tag ${config.image} (or set the plugin option image to a tag that is listed).`
			);
		}
	}
}

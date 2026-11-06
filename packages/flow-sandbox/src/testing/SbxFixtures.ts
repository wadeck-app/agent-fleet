import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PINNED_SBX_VERSION } from '../PinnedSbxVersion';

export interface FixtureCommand {
	id: string;
	args: string[];
	exitCode: number;
	stdoutFile: string;
	stderrFile: string;
}

export interface FixtureManifest {
	sbxVersion: string;
	capturedAt: string;
	platform: string;
	commands: FixtureCommand[];
}

const PACKAGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The REAL sbx outputs captured by scripts/CaptureSbxFixtures.mjs. A missing fixture is an error with the
 * command that regenerates it, never an empty string: a test must not pass on nothing.
 */
export class SbxFixtures {
	readonly directory: string;

	constructor(version: string = PINNED_SBX_VERSION) {
		this.directory = path.join(PACKAGE_DIR, 'fixtures', `sbx-${version}`);
	}

	manifest(): FixtureManifest {
		// violations-suppress: ts/no-unsafe-type-cast the manifest is written by CaptureSbxFixtures.mjs in exactly this shape
		return JSON.parse(this.read('manifest.json')) as FixtureManifest;
	}

	command(id: string): FixtureCommand {
		const command = this.manifest().commands.find(candidate => candidate.id === id);
		if (command === undefined) {
			throw new Error(
				`Fixture "${id}" is not in ${path.join(this.directory, 'manifest.json')}. Add it to scripts/CaptureSbxFixtures.mjs and re-run it.`
			);
		}
		return command;
	}

	stdout(id: string): string {
		return this.read(this.command(id).stdoutFile);
	}

	stderr(id: string): string {
		return this.read(this.command(id).stderrFile);
	}

	json(id: string): unknown {
		return JSON.parse(this.stdout(id));
	}

	private read(file: string): string {
		const full = path.join(this.directory, file);
		if (!fs.existsSync(full)) {
			throw new Error(
				`Fixture file ${full} is missing. Run: node packages/flow-sandbox/scripts/CaptureSbxFixtures.mjs`
			);
		}
		return fs.readFileSync(full, 'utf8');
	}
}

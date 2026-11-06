/**
 * The only `sbx` version this package is validated against. sbx is a 0.x proprietary tool whose JSON
 * shapes already changed once (0.48.0), so any other version is refused rather than tried.
 *
 * To move to a new version: install it, run `node packages/flow-sandbox/scripts/CaptureSbxFixtures.mjs`,
 * run the gated live check (`SBX_LIVE=1 npx tsx packages/flow-sandbox/scripts/live/SbxLiveCheck.mjs`),
 * then change this constant. `SbxFixtures.test.ts` fails until the fixtures match it.
 */
export const PINNED_SBX_VERSION = '0.49.2';

/** Where a given sbx release can be downloaded (URL pattern reported by `sbx diagnose`). */
export function sbxReleaseUrl(version: string): string {
	return `https://github.com/docker/sbx-releases/releases/tag/v${version}`;
}

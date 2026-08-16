import type { Rule, Violation } from '@wadeck/violations-rules';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type Config = Record<never, never>;

interface ExtensionPointEntry {
	id: string;
	status: string;
	versions: Array<{ version: number; status: string }>;
}

interface ExtensionPointsRegistry {
	extensionPoints: ExtensionPointEntry[];
}

interface PluginManifest {
	pluginId?: unknown;
	manifestVersion?: unknown;
	implementations?: Record<
		string,
		Record<
			string,
			{ version?: unknown; provider?: unknown; entrypoint?: unknown; export?: unknown; sensitiveFields?: unknown }
		>
	>;
}

const registryCache = new Map<string, ExtensionPointsRegistry>();

async function loadRegistry(): Promise<ExtensionPointsRegistry> {
	const cwd = process.cwd();
	const cached = registryCache.get(cwd);
	if (cached) return cached;
	const registryPath = path.join(cwd, 'packages', 'extension-points', 'extension-points.json');
	const content = await fs.readFile(registryPath, 'utf8');
	const registry = JSON.parse(content) as ExtensionPointsRegistry;
	registryCache.set(cwd, registry);
	return registry;
}

/**
 * Find the position of the closing brace that matches the opening brace at `openPos`.
 * Returns -1 if no match found.
 */
function findClosingBrace(source: string, openPos: number): number {
	let depth = 0;
	for (let i = openPos; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/**
 * Extract named block entries from a source block string: `name: { ... }` entries
 * using balanced-brace matching instead of [^}] regex.
 */
function extractNamedBlocks(block: string): Array<{ name: string; body: string }> {
	const result: Array<{ name: string; body: string }> = [];
	const pattern = /(\w+)\s*:\s*\{/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(block)) !== null) {
		const name = match[1]!;
		const openPos = match.index + match[0].length - 1;
		const closePos = findClosingBrace(block, openPos);
		if (closePos === -1) continue;
		const body = block.slice(openPos + 1, closePos);
		result.push({ name, body });
		// Advance past this block to avoid re-matching nested blocks as siblings
		pattern.lastIndex = closePos + 1;
	}
	return result;
}

async function loadPluginManifest(pluginDir: string): Promise<{ manifest: PluginManifest; source: string } | null> {
	const tsPath = path.join(pluginDir, 'plugin.config.ts');
	const jsonPath = path.join(pluginDir, 'plugin.manifest.json');

	try {
		const source = await fs.readFile(tsPath, 'utf8');
		const pluginIdMatch = source.match(/pluginId\s*:\s*['"]([^'"]+)['"]/);
		const manifestVersionMatch = source.match(/manifestVersion\s*:\s*['"]([^'"]+)['"]/);

		const implementations: PluginManifest['implementations'] = {};
		// Find the implementations block using balanced-brace matching
		const implHeaderMatch = source.match(/implementations\s*:\s*\{/);
		if (implHeaderMatch) {
			const implOpenPos = implHeaderMatch.index! + implHeaderMatch[0].length - 1;
			const implClosePos = findClosingBrace(source, implOpenPos);
			if (implClosePos !== -1) {
				const implBlock = source.slice(implOpenPos + 1, implClosePos);
				// Extract top-level extension points (e.g. workspace, approval)
				const epBlocks = extractNamedBlocks(implBlock);
				for (const { name: epName, body: epBody } of epBlocks) {
					if (epName === 'version' || epName === 'provider' || epName === 'sensitiveFields') continue;
					implementations[epName] = {};
					// Extract impl names within each extension point block
					const implBlocks = extractNamedBlocks(epBody);
					for (const { name: implName, body: implBody } of implBlocks) {
						if (implName === 'version' || implName === 'provider' || implName === 'sensitiveFields')
							continue;
						// Look for version: N inside the impl body
						const versionMatch = implBody.match(/\bversion\s*:\s*(\d+)/);
						if (versionMatch) {
							implementations[epName]![implName] = { version: parseInt(versionMatch[1]!, 10) };
						}
					}
				}
			}
		}

		return {
			source,
			manifest: {
				pluginId: pluginIdMatch?.[1],
				manifestVersion: manifestVersionMatch?.[1] as '1' | undefined,
				implementations: Object.keys(implementations).length > 0 ? implementations : undefined,
			},
		};
	} catch {
		// TS manifest not found, try JSON
	}

	try {
		const source = await fs.readFile(jsonPath, 'utf8');
		const manifest = JSON.parse(source) as PluginManifest;
		return { manifest, source };
	} catch {
		return null;
	}
}

function extractPluginId(dirName: string): string | null {
	const match = dirName.match(/^plugin-(.+)$/);
	return match?.[1] ?? null;
}

const SENSITIVE_FIELD_NAMES = [
	'token',
	'password',
	'secret',
	'key',
	'apiKey',
	'privateKey',
	'accessToken',
	'bearerToken',
];
const SUPPORTED_MANIFEST_VERSIONS = ['1'];

export const rule: Rule<Config> = {
	id: 'plugin/all',
	tags: 'ts',
	defaultScope: ['packages/plugin-*/plugin.config.ts', 'packages/plugin-*/plugin.manifest.json'],
	defaultSeverity: 'error',

	async check(files: string[]): Promise<Violation[]> {
		const violations: Violation[] = [];

		// Get unique plugin directories from the scoped files
		const pluginDirs = new Set<string>();
		for (const file of files) {
			const dir = path.dirname(file);
			pluginDirs.add(dir);
		}

		// Also scan all packages/plugin-* directories for PLUGIN-001
		let allPluginDirs: string[] = [];
		try {
			const packagesDir = path.join(process.cwd(), 'packages');
			const entries = await fs.readdir(packagesDir, { withFileTypes: true });
			allPluginDirs = entries
				.filter(e => e.isDirectory() && e.name.startsWith('plugin-'))
				.map(e => path.join(packagesDir, e.name));
		} catch {
			allPluginDirs = [];
		}

		// PLUGIN-001: Every packages/plugin-* must have a manifest file
		for (const pluginDir of allPluginDirs) {
			const tsManifest = path.join(pluginDir, 'plugin.config.ts');
			const jsonManifest = path.join(pluginDir, 'plugin.manifest.json');
			const hasTsManifest = await fs
				.access(tsManifest)
				.then(() => true)
				.catch(() => false);
			const hasJsonManifest = await fs
				.access(jsonManifest)
				.then(() => true)
				.catch(() => false);
			if (!hasTsManifest && !hasJsonManifest) {
				violations.push({
					file: pluginDir,
					line: 0,
					message: `PLUGIN-001: No manifest found. Create plugin.config.ts or plugin.manifest.json`,
				});
			}
			pluginDirs.add(pluginDir);
		}

		const registry = await loadRegistry().catch(() => null);

		for (const pluginDir of pluginDirs) {
			const dirName = path.basename(pluginDir);
			const expectedPluginId = extractPluginId(dirName);
			if (!expectedPluginId) continue;

			const manifestResult = await loadPluginManifest(pluginDir);
			if (!manifestResult) continue;

			const { manifest, source } = manifestResult;

			// PLUGIN-002: pluginId must match directory name
			if (manifest.pluginId && manifest.pluginId !== expectedPluginId) {
				violations.push({
					file: path.join(pluginDir, 'plugin.config.ts'),
					line: 1,
					message: `PLUGIN-002: manifest.pluginId "${manifest.pluginId}" does not match directory name "plugin-${expectedPluginId}"`,
				});
			}

			// PLUGIN-006: manifestVersion must be supported
			if (manifest.manifestVersion && !SUPPORTED_MANIFEST_VERSIONS.includes(String(manifest.manifestVersion))) {
				violations.push({
					file: path.join(pluginDir, 'plugin.config.ts'),
					line: 1,
					message: `PLUGIN-006: manifestVersion "${manifest.manifestVersion}" is not supported. Supported: ${SUPPORTED_MANIFEST_VERSIONS.join(', ')}`,
				});
			}

			// PLUGIN-007: No credentials or env var interpolation in manifest
			const envVarPattern = /\$\{[^}]+\}/;
			const lines = source.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]!;

				// Check for ${...} patterns (not in sensitiveFields array)
				if (envVarPattern.test(line) && !line.includes('sensitiveFields')) {
					violations.push({
						file: path.join(pluginDir, 'plugin.config.ts'),
						line: i + 1,
						message: `PLUGIN-007: Manifest must not contain env var interpolation "\${...}". Use config files for credentials.`,
					});
				}

				// Check for sensitive field key-value pairs with literal values
				for (const field of SENSITIVE_FIELD_NAMES) {
					const literalPattern = new RegExp(`\\b${field}\\s*:\\s*['"][^$'"][^'"]*['"]`);
					if (literalPattern.test(line) && !line.includes('sensitiveFields')) {
						violations.push({
							file: path.join(pluginDir, 'plugin.config.ts'),
							line: i + 1,
							message: `PLUGIN-007: Manifest must not contain a literal value for sensitive field "${field}". Use config files for credentials.`,
						});
					}
				}
			}

			if (!registry || !manifest.implementations) continue;

			for (const [extPoint, impls] of Object.entries(manifest.implementations)) {
				// PLUGIN-004: Extension point must be registered
				const registeredEp = registry.extensionPoints.find(ep => ep.id === extPoint);
				if (!registeredEp) {
					violations.push({
						file: path.join(pluginDir, 'plugin.config.ts'),
						line: 1,
						message: `PLUGIN-004: Extension point "${extPoint}" is not registered in extension-points.json`,
					});
					continue;
				}

				for (const [implName, impl] of Object.entries(impls)) {
					if (!impl) continue;

					// PLUGIN-005: Version must be supported
					if (impl.version !== undefined) {
						const supportedVersions = registeredEp.versions.map(v => v.version);
						if (!supportedVersions.includes(impl.version as number)) {
							violations.push({
								file: path.join(pluginDir, 'plugin.config.ts'),
								line: 1,
								message: `PLUGIN-005: Version ${impl.version} for "${extPoint}.${implName}" is not supported. Supported: [${supportedVersions.join(', ')}]`,
							});
						}
					}

					// PLUGIN-008: JSON entrypoint paths must not traverse outside package
					if (impl.entrypoint && typeof impl.entrypoint === 'string') {
						const normalized = path.normalize(impl.entrypoint);
						if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
							violations.push({
								file: path.join(pluginDir, 'plugin.manifest.json'),
								line: 1,
								message: `PLUGIN-008: entrypoint "${impl.entrypoint}" traverses outside the package root`,
							});
						}
					}
				}
			}

			// PLUGIN-009: workspace providers must call validateWorkspacePath
			// PLUGIN-010: workspace providers must call validateBaseDir
			if (manifest.implementations?.['workspace']) {
				// Find provider source files
				const srcDir = path.join(pluginDir, 'src');
				let srcFiles: string[] = [];
				try {
					const entries = await fs.readdir(srcDir, { withFileTypes: true });
					srcFiles = entries
						.filter(e => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
						.map(e => path.join(srcDir, e.name));
				} catch {
					srcFiles = [];
				}

				for (const srcFile of srcFiles) {
					let srcContent: string;
					try {
						srcContent = await fs.readFile(srcFile, 'utf8');
					} catch {
						continue;
					}

					// Skip exempt files
					if (srcContent.includes('@plugin-009-exempt')) continue;

					// Check if file does path construction with taskId
					const doesPathConstruction = /path\.(join|resolve)/.test(srcContent) && /taskId/.test(srcContent);

					if (doesPathConstruction) {
						// PLUGIN-009: must call validateWorkspacePath
						if (!srcContent.includes('validateWorkspacePath')) {
							violations.push({
								file: srcFile,
								line: 1,
								message: `PLUGIN-009: Workspace provider constructs paths with taskId but does not call validateWorkspacePath(). Import from extension-points.`,
							});
						}

						// PLUGIN-010: must call validateBaseDir
						if (!srcContent.includes('validateBaseDir')) {
							violations.push({
								file: srcFile,
								line: 1,
								message: `PLUGIN-010: Workspace provider constructs paths with taskId but does not call validateBaseDir(). Import from extension-points.`,
							});
						}
					}
				}
			}
		}

		return violations;
	},
};

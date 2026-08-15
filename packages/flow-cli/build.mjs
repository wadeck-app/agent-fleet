import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });

const shared = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: true,
    external: ['ws', '@wadeck/singleton-daemon-kit', 'js-yaml'],
};

await esbuild.build({
    ...shared,
    entryPoints: {
        'cli/FlowIndex': path.join(__dirname, 'src/cli/FlowIndex.ts'),
        'cli/TaskIndex': path.join(__dirname, 'src/cli/TaskIndex.ts'),
    },
    outdir: path.join(__dirname, 'dist'),
});

await esbuild.build({
    ...shared,
    entryPoints: {
        'worker/Worker': path.join(__dirname, 'src/worker/Worker.ts'),
    },
    outdir: path.join(__dirname, 'dist'),
});

// CJS bundle for Go launcher — the Go binary spawns `node flow.cjs`
// This is the production entry point; the ESM builds are for direct node usage.
// FlowCjsEntry.ts avoids top-level await (unsupported in CJS) via an async IIFE wrapper.
// define shims import.meta.url to a __filename-based URL so WorkerPool resolves correctly.
await esbuild.build({
    ...shared,
    format: 'cjs',
    // Shim import.meta.url for CJS: inject a banner variable, then replace all references.
    // esbuild define only accepts entity names (not expressions), so we use banner + define.
    // @formatter:off
    banner: { js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;' },
    define: { 'import.meta.url': '__importMetaUrl' },
    // @formatter:on
    entryPoints: {
        'flow': path.join(__dirname, 'src/cli/FlowCjsEntry.ts'),
    },
    outfile: path.join(__dirname, 'dist/flow.cjs'),
});

console.log('Build complete');

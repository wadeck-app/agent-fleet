import { runWrapperEntry } from './WrapperEntry';

// Entry of dist-plugin/plugin-sandbox/wrapper.cjs (see PluginBundler). No logic here: it only runs the entry and turns a
// failure into the message and the exit code the plugin (and the daemon log) show.
void (async () => {
	try {
		await runWrapperEntry(process.argv.slice(2), process.env);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
})();

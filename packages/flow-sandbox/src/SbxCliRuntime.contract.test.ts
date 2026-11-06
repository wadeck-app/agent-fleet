import { MockSbxHarness } from './testing/MockSbxHarness';
import { describeSandboxRuntimeContract } from './testing/SandboxRuntimeContract';

describeSandboxRuntimeContract('SbxCliRuntime over the sbx mock', () => {
	const harness = new MockSbxHarness();
	return { runtime: harness.runtime(), dispose: () => harness.dispose() };
});

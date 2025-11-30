/**
 * Simple runner for flow demos
 */

import {
  demo1_SimpleInterpolation,
  demo2_OutputExtraction,
  demo3_ConditionalBranching,
  demo4_TaskMetadata,
  demo5_ComplexPipeline,
} from './flow-demo';

async function runAllDemos() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║    Flow Engine Demo Suite              ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await demo1_SimpleInterpolation();
    await demo2_OutputExtraction();
    await demo3_ConditionalBranching();
    await demo4_TaskMetadata();
    await demo5_ComplexPipeline();

    console.log('\n========================================');
    console.log('✓ All demos completed successfully!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

runAllDemos();

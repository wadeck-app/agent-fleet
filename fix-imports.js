import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

const replacements = [
  // orchestrator package
  { from: /from ['"]\.\.\/\.\.\/shared\/([^'"]+)['"]/g, to: "from 'shared-common/$1'", package: 'orchestrator' },
  { from: /from ['"]\.\.\/\.\.\/flow\/([^'"]+)['"]/g, to: "from 'flow-engine/$1'", package: 'orchestrator' },
  { from: /from ['"]\.\.\/\.\.\/test-utils\/([^'"]+)['"]/g, to: "from 'test-utils/$1'", package: 'orchestrator' },

  // worker package
  { from: /from ['"]\.\.\/\.\.\/shared\/([^'"]+)['"]/g, to: "from 'shared-common/$1'", package: 'worker' },
  { from: /from ['"]\.\.\/\.\.\/flow\/([^'"]+)['"]/g, to: "from 'flow-engine/$1'", package: 'worker' },
  { from: /from ['"]\.\.\/\.\.\/test-utils\/([^'"]+)['"]/g, to: "from 'test-utils/$1'", package: 'worker' },

  // flow-engine package
  { from: /from ['"]\.\.\/\.\.\/shared\/([^'"]+)['"]/g, to: "from 'shared-common/$1'", package: 'flow-engine' },
  { from: /from ['"]\.\.\/\.\.\/test-utils\/([^'"]+)['"]/g, to: "from 'test-utils/$1'", package: 'flow-engine' },

  // cli package
  { from: /from ['"]\.\.\/\.\.\/orchestrator\/([^'"]+)['"]/g, to: "from 'orchestrator/$1'", package: 'cli' },
  { from: /from ['"]\.\.\/\.\.\/shared\/([^'"]+)['"]/g, to: "from 'shared-common/$1'", package: 'cli' },

  // Remove .js extensions from imports
  { from: /from '([^']+)\.js'/g, to: "from '$1'", package: 'all' },
];

async function fixImports() {
  const packages = ['orchestrator', 'worker', 'flow-engine', 'cli', 'shared-common', 'test-utils'];

  for (const pkg of packages) {
    console.log(`\nFixing imports in ${pkg}...`);
    const files = await glob(`packages/${pkg}/src/**/*.ts`);

    for (const file of files) {
      let content = readFileSync(file, 'utf-8');
      let modified = false;

      for (const replacement of replacements) {
        if (replacement.package === pkg || replacement.package === 'all') {
          const newContent = content.replace(replacement.from, replacement.to);
          if (newContent !== content) {
            content = newContent;
            modified = true;
          }
        }
      }

      if (modified) {
        writeFileSync(file, content, 'utf-8');
        console.log(`  ✓ ${file}`);
      }
    }
  }

  console.log('\n✅ All imports fixed!');
}

fixImports().catch(console.error);

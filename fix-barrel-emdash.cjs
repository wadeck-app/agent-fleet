'use strict';
const fs = require('fs');
const files = [
  'packages/web-backend/src/factories/index.ts',
  'packages/web-backend/src/repositories/index.ts',
  'packages/web-backend/src/services/index.ts',
  'packages/web-backend/src/storage/index.ts',
  'packages/web-backend/src/transport/index.ts',
  'packages/web-frontend/src/app/components/domain/index.ts',
  'packages/web-frontend/src/app/pages/auth/index.ts',
  'packages/web-frontend/src/app/pages/dashboard/index.ts',
  'packages/web-frontend/src/app/pages/flows/flow-editor/edges/index.ts',
  'packages/web-frontend/src/app/pages/flows/flow-editor/index.ts',
  'packages/web-frontend/src/app/pages/flows/flow-editor/nodes/index.ts',
  'packages/web-frontend/src/framework/components/advanced/index.ts',
  'packages/web-frontend/src/framework/components2/list/index.ts',
  'packages/web-frontend/src/framework/components2/list/renderers/index.ts',
  'packages/web-frontend/src/framework/lego/index.ts',
  'packages/web-frontend/src/framework/types/contracts/index.ts',
  'packages/web-frontend/src/transport/index.ts',
];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const fixed = content.replace(/—/g, '--').replace(/–/g, '-');
  if (fixed !== content) {
    fs.writeFileSync(f, fixed, 'utf8');
    console.log('Fixed:', f);
  }
}
console.log('Done');

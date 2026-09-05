'use strict';
const { execSync } = require('child_process');
const ROOT = 'C:/Workspace_Tooling/agent-fleet';
try {
  const out = execSync('violations check', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const files = [...new Set(out.split('\n').filter(l => l.includes('[shared/no-french]')).map(l => l.match(/^(.+?):\d+/)?.[1]).filter(Boolean))];
  files.forEach(f => console.log(f));
} catch(e) {
  const out = (e.stdout||'') + (e.stderr||'');
  const files = [...new Set(out.split('\n').filter(l => l.includes('[shared/no-french]')).map(l => l.match(/^(.+?):\d+/)?.[1]).filter(Boolean))];
  files.forEach(f => console.log(f));
}

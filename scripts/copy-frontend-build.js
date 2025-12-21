import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const source = path.join(__dirname, '../packages/frontend/dist');
const dest = path.join(__dirname, '../packages/backend/public');

// Remove old public folder
if (fs.existsSync(dest)) {
	fs.rmSync(dest, { recursive: true, force: true });
	console.log('✓ Removed old backend/public/');
}

// Check if source exists
if (!fs.existsSync(source)) {
	console.error('❌ Error: packages/frontend/dist/ does not exist. Run npm run build:frontend first.');
	process.exit(1);
}

// Copy frontend/dist → backend/public
fs.cpSync(source, dest, { recursive: true });

console.log('✓ Frontend build copied to packages/backend/public/');

import { readFileSync } from 'fs';

const path = process.argv[2];
const lines = readFileSync(path, 'utf8').split('\n');
for (const line of lines) {
	if (!line.trim()) continue;
	try {
		const obj = JSON.parse(line);
		if (obj.role === 'assistant') {
			const content = obj.content;
			if (Array.isArray(content)) {
				for (const block of content) {
					if (block.type === 'text' && block.text) {
						console.log('=== ASSISTANT TEXT ===');
						console.log(block.text.slice(0, 5000));
					}
				}
			} else if (typeof content === 'string') {
				console.log('=== ASSISTANT TEXT ===');
				console.log(content.slice(0, 5000));
			}
		}
	} catch (e) {}
}

import fs from 'fs';
import { globSync } from 'glob';
import path from 'path';

const projectRoot = process.cwd();
const actualPattern = path.join(projectRoot, 'test-results', '**', '*-actual.png');
const actualFiles = globSync(actualPattern);

if (actualFiles.length === 0) {
	console.log('No actual screenshots found to approve.');
	process.exit(0);
}

//FIXME actually it's more complicated than expected
// due to some folder in test-results being _all.storybook.visual.ts-v-7f055-ponents-TextArea---WithRows-visual-mobile
// when it's too long

let approvedCount = 0;
actualFiles.forEach(actualPath => {
	const parts = actualPath.split('/');

	// Extract dynamic test file from the test-results folder
	// Example segment: "_all.storybook.visual.ts-visual-Pages-ChatPage---Default-visual-desktop"
	const fileSegment = parts.find(seg => seg.includes('_all.storybook.visual.ts'));
	if (!fileSegment) {
		return;
	}

	// Extract test file, story name, project, etc
	const regex = /^(_all.storybook.visual.ts)-visual-(.+)---(.+)-(.+)$/;
	const match = fileSegment.match(regex);
	if (!match) {
		return;
	}

	const [_, testFile, testPathSegment, storyName, projectName] = match;

	// Reconstruct expected path
	const remainingPath = parts.slice(parts.indexOf(fileSegment) + 1); // e.g., pages/ChatPage/Default-actual.png
	const fileName = remainingPath.pop().replace('-actual', ''); // remove -actual
	const expectedDir = path.join(
		projectRoot,
		'e2e',
		'tests',
		'storybook',
		`${testFile}--snapshots`,
		...remainingPath.slice(0, -1)
	);
	if (!fs.existsSync(expectedDir)) {
		fs.mkdirSync(expectedDir, { recursive: true });
	}

	const expectedPath = path.join(expectedDir, fileName);
	//	fs.renameSync(actualPath, expectedPath);
	console.log(`Approved: ${actualPath} → ${expectedPath}`);
	approvedCount++;
});

console.log(`Approved ${approvedCount} screenshots.`);

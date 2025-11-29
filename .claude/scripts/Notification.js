const fs = require('fs');
const path = require('path');

// @formatter:off
// Get all arguments
const args = process.argv.slice(2);
const env = process.env;

// Read stdin
let stdinData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  stdinData += chunk;
});

process.stdin.on('end', () => {
  // Parse stdin JSON
  let parsedStdin = null;
  try {
    parsedStdin = JSON.parse(stdinData);
  } catch (e) {
    parsedStdin = stdinData; // Keep as string if parsing fails
  }

  // Prepare content to write with stdin, args and env
  const content = {
    timestamp: new Date().toISOString(),
    stdin: parsedStdin,
    args: args,
    env: Object.keys(env)
      .filter(key => key.startsWith('CLAUDE_'))
      .reduce((obj, key) => {
        obj[key] = env[key];
        return obj;
      }, {})
  };

  // Write to project root (use CLAUDE_PROJECT_DIR)
  const projectDir = env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..');
  fs.appendFileSync(
    path.join(projectDir, 'Notification.json'),
    JSON.stringify(content, null, 2) + '\n---\n'
  );

  console.log('Notification hook: data written to Notification.json');
});
// @formatter:on

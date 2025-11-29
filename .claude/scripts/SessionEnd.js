const fs = require('fs');
const path = require('path');

// @formatter:off
// Récupérer tous les arguments
const args = process.argv.slice(2);
const env = process.env;

// Read stdin
let stdinData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  stdinData += chunk;
});

process.stdin.on('end', () => {
  // Parser le JSON du stdin
  let parsedStdin = null;
  try {
    parsedStdin = JSON.parse(stdinData);
  } catch (e) {
    parsedStdin = stdinData; // Garder comme string si le parsing échoue
  }

  // Préparer le contenu à écrire avec stdin, args et env
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

  // Écrire dans la racine du projet (utiliser CLAUDE_PROJECT_DIR)
  const projectDir = env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..');
  fs.appendFileSync(
    path.join(projectDir, 'SessionEnd.json'),
    JSON.stringify(content, null, 2) + '\n---\n'
  );

  console.log('SessionEnd hook: data written to SessionEnd.json');
});
// @formatter:on

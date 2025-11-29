const fs = require('fs');
const path = require('path');

// @formatter:off
// Récupérer tous les arguments
const args = process.argv.slice(2);
const env = process.env;

// Read stdin
let stdinData = '';

//FIXME later
return;


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
    path.join(projectDir, 'Stop.json'),
    JSON.stringify(content, null, 2) + '\n---\n'
  );

  console.log('Stop hook: data written to Stop.json');

  // Fonction helper pour logger dans Stop.txt
  const logToFile = (message) => {
    const logPath = path.join(projectDir, 'Stop.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  };

  // Mode stoppable : DÉSACTIVÉ - code dangereux qui crée des boucles infinies
  if (false && env.CLAUDE_CODE_STOPPABLE === 'true') {
    console.log('Mode stoppable detected: termination of Claude process...');
    logToFile('Mode stoppable detected');
    logToFile(`Project dir: ${projectDir}`);

    // Attendre un peu pour que les logs soient écrits
    setTimeout(() => {
      logToFile('setTimeout callback executed');
      try {
        logToFile('Entering try block');
        const { spawn, execSync } = require('child_process');
        logToFile('child_process required');
        const ppid = process.ppid;
        const pid = process.pid;

        logToFile(`Current process PID: ${pid}`);
        logToFile(`Parent process PID (ppid): ${ppid}`);
        logToFile(`Platform: ${process.platform}`);

        if (!ppid) {
          const errMsg = 'PPID not available';
          console.error(errMsg);
          logToFile(`ERROR: ${errMsg}`);
          process.exit(1);
          return;
        }

        console.log(`Killing parent process with PID: ${ppid}`);

        // Sur Windows, utiliser PowerShell pour tuer tous les processus node.exe/claude liés
        if (process.platform === 'win32') {
          logToFile('Platform is win32, entering Windows-specific code');
          try {
            logToFile('About to run tasklist');
            // Vérifier quel processus on va tuer
            const tasklistOutput = execSync(`tasklist /FI "PID eq ${ppid}" /FO CSV /NH`, { encoding: 'utf8' });
            logToFile(`PPID process: ${tasklistOutput.trim()}`);

            // Créer un fichier .bat qui va faire le kill
            const killerBatPath = path.join(projectDir, 'Stop_Killer.bat');
            const logPath = path.join(projectDir, 'Stop_Killer.txt');
            logToFile(`Killer bat path will be: ${killerBatPath}`);
            logToFile(`Killer log path will be: ${logPath}`);

            // Créer un fichier batch simple et robuste
            const batContent = `@echo off
echo [%date% %time%] Killer bat started >> "${logPath}"
echo [%date% %time%] Target PID: ${ppid} >> "${logPath}"
timeout /t 2 /nobreak > nul
echo [%date% %time%] Sleep completed, attempting to kill process ${ppid} >> "${logPath}"
taskkill /PID ${ppid} /T /F >> "${logPath}" 2>&1
echo [%date% %time%] Taskkill command completed with errorlevel %errorlevel% >> "${logPath}"
`;

            // Écrire le script BAT sur le disque
            logToFile('About to write BAT script to disk');
            fs.writeFileSync(killerBatPath, batContent);
            logToFile(`BAT script written to: ${killerBatPath}`);

            // Vérifier que le fichier existe
            const fileExists = fs.existsSync(killerBatPath);
            logToFile(`File exists after write: ${fileExists}`);

            // Lancer le batch avec cmd /c start pour le détacher complètement
            logToFile('About to spawn batch process');
            const killer = spawn('cmd', ['/c', 'start', '/min', '/b', killerBatPath], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true
            });

            logToFile(`Killer process spawned, PID: ${killer.pid || 'unknown'}`);

            killer.unref();
            logToFile('Killer process unref called');

            console.log('Detached BAT killer process spawned');
            logToFile('Detached BAT killer process spawned successfully');
            logToFile(`Killer script path: ${killerBatPath}`);
          } catch (e) {
            logToFile(`ERROR during process termination setup: ${e.message}`);
            logToFile(`ERROR stack: ${e.stack}`);
          }
        } else {
          // Sur Unix/Linux/Mac, utiliser kill directement
          logToFile(`Sending SIGTERM to PID ${ppid}`);
          process.kill(ppid, 'SIGTERM');
          logToFile('SIGTERM sent successfully');
        }
      } catch (err) {
        const errMsg = `Erreur lors de la terminaison du process parent: ${err.message}`;
        console.error(errMsg);
        logToFile(`ERROR: ${errMsg}`);
        logToFile(`Stack: ${err.stack}`);
      }
      // Terminer le hook lui-même
      logToFile('Hook exiting now');
      process.exit(0);
    }, 300);
  } else {
    console.log('Mode stoppable not detected: letting Claude continuing...');
  }
});
// @formatter:on

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateIcons } from './make-icons.mjs';

// Run from the native project explicitly: the standard src-tauri discovery
// convention does not apply to our desktop/ directory.
const command = process.argv[2];
if (!['dev', 'build'].includes(command)) {
  throw new Error(
    'Usage: node scripts/desktop.mjs <dev|build> [Tauri options]',
  );
}
const cli = fileURLToPath(
  new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url),
);
await generateIcons({ desktop: true });
const child = spawn(
  process.execPath,
  [cli, command, ...process.argv.slice(3)],
  {
    cwd: fileURLToPath(new URL('../desktop/', import.meta.url)),
    stdio: 'inherit',
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

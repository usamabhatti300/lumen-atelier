// Starts the Vite dev server and the local API server together.
// Ctrl+C stops both. No extra dependency needed.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'dev:api'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npm, ['run', 'dev:web'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

const stop = () => {
  for (const child of children) if (!child.killed) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && code !== 0 && stop());

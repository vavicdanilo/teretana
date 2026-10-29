import { cp, mkdir, readdir, rm, access } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, 'dist');
async function checkScripts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await checkScripts(path);
    else if (extname(path) === '.js') execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  }
}
await access(resolve(root, 'index.html'));
await checkScripts(resolve(root, 'src'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'index.html'), resolve(output, 'index.html'));
await cp(resolve(root, 'src'), resolve(output, 'src'), { recursive: true });
try {
  await access(resolve(root, 'public'));
  await cp(resolve(root, 'public'), resolve(output, 'public'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Build uspješan. Statičke datoteke su u dist/.');

// MonkaMemory local Windows test launcher. Nothing in this file goes into Unity.
// Production multiplayer still requires a publicly reachable HTTPS backend.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(root, 'backend');
const envFile = resolve(backend, '.env');
const port = '8787';
const localUrl = 'http://localhost:' + port;

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Please install Node.js 22 or newer.');
  process.exit(1);
}

function readToken() {
  const env = readFileSync(envFile, 'utf8');
  return /^ADMIN_SETUP_TOKEN=(.+)$/m.exec(env)?.[1]?.trim() || '';
}

async function firstRun() {
  const cli = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nMONKAMEMORY / FIRST-TIME SETUP');
    console.log('Open Neon > MonkaMemory > Connect and copy the pooled database URL.');
    const answer = (await cli.question('\nPaste the Neon connection URL: ')).trim();
    let address;
    try { address = new URL(answer); } catch { throw Error('That is not a valid PostgreSQL connection URL.'); }
    if (!['postgres:', 'postgresql:'].includes(address.protocol) ||
        !address.hostname || address.pathname !== '/monkamemory') {
      throw Error('Choose the monkamemory database in Neon and copy its PostgreSQL URL.');
    }
    if (answer.includes('\n') || answer.includes('\r')) throw Error('Invalid connection URL.');
    const pepper = randomBytes(32).toString('hex');
    const setupToken = randomBytes(32).toString('hex');
    const payload = [
      'PORT=' + port,
      'PUBLIC_URL=' + localUrl,
      'DATABASE_URL=' + JSON.stringify(answer),
      'AUTH_PEPPER=' + pepper,
      'ADMIN_SETUP_TOKEN=' + setupToken,
      ''
    ].join('\n');
    mkdirSync(backend, { recursive:true });
    writeFileSync(envFile, payload, { flag:'wx', mode:0o600 });
    console.log('\nConnection saved privately in backend/.env.');
  } finally { cli.close(); }
}

function command(binary, args, options) {
  return new Promise((resolveDone, reject) => {
    const win = process.platform === 'win32';
    const child = spawn(win && binary === 'npm' ? 'npm.cmd' : binary, args,
      { cwd: backend, stdio:'inherit', shell:win && binary === 'npm', ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolveDone() : reject(Error(binary + ' failed (' + code + ')')));
  });
}

async function testHealth() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(localUrl + '/api/health');
      if (response.ok && (await response.json()).ok) return true;
    } catch { /* server still booting */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 350));
  }
  return false;
}

async function main() {
  if (!existsSync(envFile)) await firstRun();
  if (!existsSync(resolve(backend, 'node_modules', 'pg'))) {
    console.log('\nInstalling backend dependencies for local use...');
    await command('npm', ['install', '--omit=dev']);
  }
  const token = readToken();
  const url = localUrl + '/#setup=' + token;
  console.log('\nStarting MonkaMemory at ' + localUrl);
  console.log('Neon credentials are never shared with Unity.');
  const child = spawn(process.execPath, ['--env-file=.env', 'server.js'],
    { cwd:backend, stdio:'inherit', env:process.env });
  child.on('error', e => console.error('Server failed:',e.message));
  if (await testHealth()) {
    console.log('\nDashboard: ' + localUrl);
    console.log('If this is your first launch, set your owner password in the browser.');
    if (process.platform === 'win32') {
      try { spawn('explorer.exe', [url], { detached:true, stdio:'ignore' }).unref(); }
      catch { /* URL is still printed */ }
    }
  } else {
    console.error('Backend health check failed. Review the server errors above.');
  }
  await new Promise(resolveDone => child.on('exit', resolveDone));
}

main().catch(e => { console.error('\nSetup error:', e.message); process.exitCode = 1; });

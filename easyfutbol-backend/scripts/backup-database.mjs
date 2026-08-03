import 'dotenv/config';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`);

const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 14));
const backupDir = path.resolve(process.env.BACKUP_DIR || 'backups/database');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const basename = `easyfutbol_${stamp}.sql.gz`;
const temporaryPath = path.join(backupDir, `${basename}.partial`);
const finalPath = path.join(backupDir, basename);

await mkdir(backupDir, { recursive: true, mode: 0o700 });

const dump = spawn('mysqldump', [
  '--single-transaction',
  '--quick',
  '--routines',
  '--triggers',
  '--events',
  '--hex-blob',
  '--set-gtid-purged=OFF',
  '--host', process.env.DB_HOST,
  '--port', String(process.env.DB_PORT || 3306),
  '--user', process.env.DB_USER,
  process.env.DB_NAME,
], {
  env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const gzip = spawn('gzip', ['-9'], { stdio: ['pipe', 'pipe', 'pipe'] });
const dumpClosed = new Promise((resolve) => dump.on('close', resolve));
const gzipClosed = new Promise((resolve) => gzip.on('close', resolve));

let dumpError = '';
let gzipError = '';
dump.stderr.on('data', (chunk) => { dumpError += chunk.toString(); });
gzip.stderr.on('data', (chunk) => { gzipError += chunk.toString(); });

try {
  dump.stdout.pipe(gzip.stdin);
  await pipeline(gzip.stdout, createWriteStream(temporaryPath, { mode: 0o600 }));
  const [dumpCode, gzipCode] = await Promise.all([dumpClosed, gzipClosed]);
  if (dumpCode !== 0) throw new Error(`mysqldump terminó con código ${dumpCode}: ${dumpError.trim()}`);
  if (gzipCode !== 0) throw new Error(`gzip terminó con código ${gzipCode}: ${gzipError.trim()}`);

  const backupStat = await stat(temporaryPath);
  if (backupStat.size < 1024) throw new Error(`La copia es sospechosamente pequeña (${backupStat.size} bytes)`);
  await rename(temporaryPath, finalPath);

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = await readdir(backupDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of files) {
    if (!entry.isFile() || !/^easyfutbol_\d{8}T\d{6}Z\.sql\.gz$/.test(entry.name)) continue;
    const candidatePath = path.join(backupDir, entry.name);
    if ((await stat(candidatePath)).mtimeMs < cutoff) {
      await unlink(candidatePath);
      removed += 1;
    }
  }
  console.log(JSON.stringify({ ok: true, backup: finalPath, bytes: backupStat.size, retentionDays, removed }));
} catch (error) {
  await unlink(temporaryPath).catch(() => {});
  throw error;
}

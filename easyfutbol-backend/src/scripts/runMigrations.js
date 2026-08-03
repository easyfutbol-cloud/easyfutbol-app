import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const migrationOrder = [
  '20260803_easyfutbol_plus.sql',
  '20260803_plus_fair_play.sql',
  '20260803_match_waitlist.sql',
  '20260803_referrals.sql',
  '20260803_scheduled_matches.sql',
  '20260804_subscription_platform.sql',
  '20260804_competitive_foundation.sql',
  '20260804_competitive_evaluations.sql',
  '20260804_competitive_weekly_scoring.sql',
  '20260804_competitive_season_completion.sql',
];

const currentFile = fileURLToPath(import.meta.url);
const migrationsDir = path.resolve(path.dirname(currentFile), '../../migrations');
const statusOnly = process.argv.includes('--status');
const dryRun = process.argv.includes('--dry-run');

const required = ['DB_HOST','DB_USER','DB_NAME'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(', ')}`);
  process.exit(1);
}

const connection = await mysql.createConnection({
  host:process.env.DB_HOST,
  port:Number(process.env.DB_PORT || 3306),
  user:process.env.DB_USER,
  password:process.env.DB_PASSWORD,
  database:process.env.DB_NAME,
  multipleStatements:true,
});

let lockAcquired=false;
try {
  const [[lock]]=await connection.query("SELECT GET_LOCK('easyfutbol_schema_migrations',10) AS acquired");
  if (Number(lock.acquired)!==1) throw new Error('Otra ejecución de migraciones está en curso');
  lockAcquired=true;
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_ms INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migration_filename (filename)
    )`
  );
  const [appliedRows]=await connection.query('SELECT filename,checksum,applied_at FROM schema_migrations ORDER BY id');
  const applied=new Map(appliedRows.map((row)=>[row.filename,row]));
  let pending=0;
  for (const filename of migrationOrder) {
    const sql=await fs.readFile(path.join(migrationsDir,filename),'utf8');
    const checksum=crypto.createHash('sha256').update(sql).digest('hex');
    const previous=applied.get(filename);
    if (previous) {
      if (previous.checksum!==checksum) throw new Error(`La migración aplicada ${filename} ha cambiado. No se continuará.`);
      console.log(`✓ aplicada  ${filename}`);
      continue;
    }
    pending+=1;
    if (statusOnly || dryRun) { console.log(`○ pendiente ${filename}`); continue; }
    const started=Date.now();
    console.log(`→ aplicando ${filename}`);
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (filename,checksum,execution_ms) VALUES (?,?,?)',[filename,checksum,Date.now()-started]);
    console.log(`✓ completada ${filename} (${Date.now()-started} ms)`);
  }
  if (statusOnly || dryRun) console.log(`\n${pending} migración(es) pendiente(s).`);
  else console.log(`\nMigraciones completadas. ${pending} nueva(s) aplicada(s).`);
} catch(error) {
  console.error(`\nMigración detenida: ${error.message}`);
  process.exitCode=1;
} finally {
  if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('easyfutbol_schema_migrations')").catch(()=>{});
  await connection.end();
}

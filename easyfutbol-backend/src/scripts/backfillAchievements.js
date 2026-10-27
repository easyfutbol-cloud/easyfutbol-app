// Desbloquea a todos los jugadores los logros que ya han alcanzado esta
// temporada (y les suma sus puntos). Antes, si faltan logros del catálogo en la
// tabla `achievements`, los da de alta. Con --dry-run solo informa.
//
//   npm run achievements:backfill -- --dry-run
//   npm run achievements:backfill
import { pool } from '../config/db.js';
import { ACHIEVEMENT_CATALOG, SEASON_START, getAchievementProgress } from '../services/achievementCatalog.js';
import { getReachedAchievementCodes, syncUserAchievements } from '../services/achievementsService.js';

const dryRun = process.argv.includes('--dry-run');

// La tabla se creó a mano en el servidor: solo rellenamos las columnas que tenga.
async function seedMissingCatalog() {
  const [columns] = await pool.query('SHOW COLUMNS FROM achievements');
  const names = new Set(columns.map((column) => column.Field));
  const [rows] = await pool.query('SELECT code, is_active FROM achievements');
  const existing = new Map(rows.map((row) => [row.code, Number(row.is_active)]));
  const missing = ACHIEVEMENT_CATALOG.filter((item) => !existing.has(item.code));
  const inactive = ACHIEVEMENT_CATALOG.filter((item) => existing.get(item.code) === 0).map((item) => item.code);

  if (!dryRun) {
    for (const item of missing) {
      const values = { code: item.code, name: item.title, title: item.title, description: item.description, points: item.points, is_active: 1 };
      const fields = Object.keys(values).filter((field) => names.has(field));
      await pool.query(
        `INSERT INTO achievements (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
        fields.map((field) => values[field])
      );
    }
  }
  return { missing: missing.map((item) => item.code), inactive };
}

async function main() {
  const catalog = await seedMissingCatalog();
  console.log(`Catálogo: ${ACHIEVEMENT_CATALOG.length} logros, ${catalog.missing.length} sin dar de alta${catalog.missing.length ? ` (${catalog.missing.join(', ')})` : ''}${dryRun || !catalog.missing.length ? '' : ' → añadidos'}`);
  if (catalog.inactive.length) console.log(`Ojo: desactivados en la tabla (no se desbloquearán): ${catalog.inactive.join(', ')}`);

  const [players] = await pool.query(
    `SELECT DISTINCT mps.user_id
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE m.starts_at >= ?`,
    [SEASON_START]
  );
  const pointsByCode = new Map(ACHIEVEMENT_CATALOG.map((item) => [item.code, item.points]));

  let unlockedTotal = 0;
  let playersWithNew = 0;
  let pointsAwarded = 0;
  let over500 = 0;
  for (const { user_id: userId } of players) {
    let codes;
    if (dryRun) {
      const [owned] = await pool.query(
        `SELECT a.code FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ?`,
        [userId]
      );
      const ownedCodes = new Set(owned.map((row) => row.code));
      codes = getReachedAchievementCodes(await getAchievementProgress(pool, userId)).filter((code) => !ownedCodes.has(code));
    } else {
      codes = await syncUserAchievements(userId);
    }
    if (!codes.length) continue;
    const points = codes.reduce((sum, code) => sum + (pointsByCode.get(code) || 0), 0);
    const [[user]] = await pool.query('SELECT COALESCE(achievement_points, 0) AS points FROM users WHERE id = ?', [userId]);
    const finalPoints = Number(user?.points || 0) + (dryRun ? points : 0);
    if (finalPoints >= 500) over500 += 1;
    unlockedTotal += codes.length;
    playersWithNew += 1;
    pointsAwarded += points;
  }

  console.log(`${dryRun ? '[SIMULACIÓN] ' : ''}Jugadores con partidos esta temporada: ${players.length}`);
  console.log(`${dryRun ? 'Se desbloquearían' : 'Desbloqueados'}: ${unlockedTotal} logros a ${playersWithNew} jugadores (+${pointsAwarded} puntos en total)`);
  console.log(`De ellos, con 500 puntos o más: ${over500}`);
}

main()
  .catch((error) => {
    console.error('Error en el backfill de logros:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

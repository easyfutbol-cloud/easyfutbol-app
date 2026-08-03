import { pool } from '../config/db.js';
import { getUserEntitlements } from './subscriptionService.js';

const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const toMysql = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

export async function getCurrentCompetitiveSeason(db = pool) {
  const [[season]] = await db.query(
    `SELECT * FROM competitive_seasons
     WHERE status IN ('active','scoring') AND starts_at<=NOW() AND ends_at>NOW()
     ORDER BY starts_at DESC LIMIT 1`
  );
  return season || null;
}

export async function createCompetitiveSeason(db, { name, code, startsAt, createdBy }) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new Error('Fecha de inicio inválida');
  const end = addDays(start, 28);
  const [result] = await db.query(
    `INSERT INTO competitive_seasons (code,name,starts_at,ends_at,status,created_by)
     VALUES (?,?,?,?, 'draft', ?)`,
    [code, name, toMysql(start), toMysql(end), createdBy]
  );
  for (let week = 1; week <= 4; week += 1) {
    const weekStart = addDays(start, (week - 1) * 7);
    await db.query(
      `INSERT INTO competitive_weeks (season_id,week_number,starts_at,ends_at)
       VALUES (?,?,?,?)`,
      [result.insertId, week, toMysql(weekStart), toMysql(addDays(weekStart, 7))]
    );
  }
  return { id:result.insertId, starts_at:start, ends_at:end };
}

export async function grantPlusTrialForCurrentSeason(db, userId, sourceReference) {
  const [[season]] = await db.query(
    `SELECT * FROM competitive_seasons
     WHERE status IN ('active','upcoming') AND ends_at>NOW()
     ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, starts_at ASC LIMIT 1`
  );
  if (!season) return { granted:false, reason:'no_available_season' };
  const [[previous]] = await db.query(
    `SELECT id FROM subscription_entitlements
     WHERE user_id=? AND entitlement_code='competitive_access' AND source_type='plus_trial' LIMIT 1`,
    [userId]
  );
  if (previous) return { granted:false, reason:'already_used' };
  const [result] = await db.query(
    `INSERT INTO subscription_entitlements
       (user_id,entitlement_code,source_type,source_reference,starts_at,ends_at,metadata)
     VALUES (?, 'competitive_access','plus_trial',?,?,?,JSON_OBJECT('season_id',?))`,
    [userId, sourceReference, season.starts_at, season.ends_at, season.id]
  );
  return { granted:true, entitlementId:result.insertId, season };
}

export async function getCompetitiveAccess(db, userId) {
  const season = await getCurrentCompetitiveSeason(db);
  const entitlements = await getUserEntitlements(db, userId);
  return {
    season,
    has_access:Boolean(season && entitlements.competitive.has_access),
    source:entitlements.competitive.source,
    access_ends_at:entitlements.competitive.ends_at,
    plan:entitlements.plan,
  };
}

export async function ensureSeasonPlayer(db, userId) {
  const access = await getCompetitiveAccess(db, userId);
  if (!access.has_access) return { access, player:null };
  const [[user]] = await db.query('SELECT preferred_location FROM users WHERE id=? LIMIT 1', [userId]);
  const locationId = String(user?.preferred_location || '').toLowerCase() === 'asturias' ? 2 : 1;
  const [[bronze]] = await db.query("SELECT id FROM competitive_divisions WHERE code='bronze' LIMIT 1");
  const [[previousResult]] = await db.query(
    `SELECT csr.next_division_id FROM competitive_season_results csr JOIN competitive_seasons cs ON cs.id=csr.season_id
     WHERE csr.user_id=? AND cs.status='completed' ORDER BY cs.ends_at DESC LIMIT 1`,[userId]
  );
  const [[entitlement]] = await db.query(
    `SELECT id FROM subscription_entitlements WHERE user_id=? AND entitlement_code='competitive_access'
     AND revoked_at IS NULL AND starts_at<=NOW() AND (ends_at IS NULL OR ends_at>NOW()) ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  await db.query(
    `INSERT INTO competitive_season_players
       (season_id,user_id,division_id,location_id,access_source,access_entitlement_id,status)
     VALUES (?,?,?,?,?,?, 'provisional')
     ON DUPLICATE KEY UPDATE access_source=VALUES(access_source), access_entitlement_id=VALUES(access_entitlement_id)`,
    [access.season.id, userId, previousResult?.next_division_id || bronze.id, locationId, access.source === 'pro' ? 'pro' : 'plus_trial', entitlement?.id || null]
  );
  const [[player]] = await db.query(
    `SELECT csp.*, d.code AS division_code,d.name AS division_name,d.color_hex
     FROM competitive_season_players csp JOIN competitive_divisions d ON d.id=csp.division_id
     WHERE csp.season_id=? AND csp.user_id=? LIMIT 1`,
    [access.season.id, userId]
  );
  return { access, player };
}

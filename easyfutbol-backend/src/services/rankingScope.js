// Periodos (mes, trimestre, año en hora de Madrid) y sedes para los rankings.
// Compartido por /stats/top-players, los tops de Social y los popups.
import { madridWallTimeToUtc, toMysqlUtc } from '../utils/madridDateTime.js';
import { formatLocationLabel } from './weeklyLineupService.js';

// Sede de un partido: su location_id o, en partidos antiguos sin él, por ciudad.
export const MATCH_LOCATION_ID_SQL = "COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END)";

const normalizeLocationSlug = (value = '') => String(value || '').trim().toLowerCase();

export const madridCalendarDate = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const calendarDate = (year, monthIndex, day = 1) => {
  const value = new Date(Date.UTC(year, monthIndex, day));
  return value.toISOString().slice(0, 10);
};

export const getPeriodBounds = (period, rawReferenceDate) => {
  const candidate = String(rawReferenceDate || '');
  const candidateDate = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? new Date(`${candidate}T12:00:00Z`) : null;
  const referenceDate = candidateDate && !Number.isNaN(candidateDate.getTime())
    && candidateDate.toISOString().slice(0, 10) === candidate ? candidate : madridCalendarDate();
  const [year, month] = referenceDate.split('-').map(Number);
  let startDate;
  let endDate;

  if (period === 'quarterly') {
    const quarterMonth = Math.floor((month - 1) / 3) * 3;
    startDate = calendarDate(year, quarterMonth);
    endDate = calendarDate(year, quarterMonth + 3);
  } else if (period === 'yearly') {
    startDate = calendarDate(year, 0);
    endDate = calendarDate(year + 1, 0);
  } else {
    startDate = calendarDate(year, month - 1);
    endDate = calendarDate(year, month);
  }

  return {
    start: toMysqlUtc(madridWallTimeToUtc(startDate, '00:00')),
    end: toMysqlUtc(madridWallTimeToUtc(endDate, '00:00')),
  };
};

export const getLocationFilter = (query = {}) => {
  const params = [];

  const locationId = Number(query.location_id || query.locationId || 0);
  if (Number.isInteger(locationId) && locationId > 0) {
    return {
      sql: `AND COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) = ?`,
      params: [locationId],
    };
  }

  const locationSlug = normalizeLocationSlug(query.location_slug || query.locationSlug || query.slug);
  if (locationSlug) {
    if (locationSlug === 'asturias') {
      return {
        sql: `AND COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) = 2`,
        params,
      };
    }

    if (locationSlug === 'valladolid') {
      return {
        sql: `AND COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) = 1`,
        params,
      };
    }
  }

  return { sql: '', params };
};

/**
 * Sede del jugador: la que eligió al registrarse (preferred_location) o, si no
 * la tiene, la de sus partidos más habituales. null si no se puede saber.
 */
export async function getUserSedeSlug(db, userId) {
  const [[user]] = await db.query('SELECT preferred_location FROM users WHERE id=? LIMIT 1', [userId]);
  const chosen = formatLocationLabel(user?.preferred_location);
  if (chosen) return chosen.toLowerCase();

  const [[inferred]] = await db.query(
    // Subconsulta para agrupar por la sede ya calculada: con ONLY_FULL_GROUP_BY
    // (por defecto en MySQL 8) agrupar por el alias de la expresión falla.
    `SELECT slug FROM (
       SELECT COALESCE(l.slug, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'asturias' ELSE 'valladolid' END) AS slug
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       LEFT JOIN locations l ON l.id = m.location_id
       WHERE i.user_id=?
     ) played
     GROUP BY slug ORDER BY COUNT(*) DESC LIMIT 1`,
    [userId]
  );
  const label = formatLocationLabel(inferred?.slug);
  return label ? label.toLowerCase() : null;
}


// Ligas entre amigos vistas desde administración: cuántas hay y cómo van.
// Montado en /api/admin/friend-leagues
import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { positiveId } from '../services/socialService.js';
import { getLeague, getMembers, getStandings } from '../services/friendLeagueService.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const MAX_ITEMS = 200;

router.get('/', async (_req, res) => {
  try {
    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status='draft'),0) AS draft,
              COALESCE(SUM(status='active'),0) AS active,
              COALESCE(SUM(status='finished'),0) AS finished,
              COALESCE(SUM(created_at >= NOW() - INTERVAL 7 DAY),0) AS last_7_days
       FROM friend_leagues`
    );
    const [[players]] = await pool.query(`SELECT COUNT(DISTINCT user_id) AS players FROM friend_league_members WHERE status='accepted'`);
    const [items] = await pool.query(
      `SELECT l.id, l.name, l.status, l.team_size, l.matches_goal, l.duration_days, l.created_at, l.started_at, l.ends_at,
              u.name AS owner_name,
              COALESCE(SUM(m.status='accepted'),0) AS accepted,
              COALESCE(SUM(m.status='invited'),0) AS invited
       FROM friend_leagues l
       JOIN users u ON u.id=l.owner_id
       LEFT JOIN friend_league_members m ON m.league_id=l.id
       GROUP BY l.id, l.name, l.status, l.team_size, l.matches_goal, l.duration_days, l.created_at, l.started_at, l.ends_at, u.name
       ORDER BY l.created_at DESC
       LIMIT ?`,
      [MAX_ITEMS]
    );
    const toNumbers = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
    res.json({
      ok: true,
      summary: { ...toNumbers(summary), players: Number(players.players) },
      items: items.map((item) => ({ ...item, accepted: Number(item.accepted), invited: Number(item.invited) })),
    });
  } catch (error) {
    console.error('[ADMIN FRIEND LEAGUES list]', error);
    res.status(500).json({ ok: false, msg: 'No se pudieron cargar las ligas' });
  }
});

/** Jugadores de una liga y, si ya ha empezado, su clasificación. */
router.get('/:id', async (req, res) => {
  try {
    const leagueId = positiveId(req.params.id);
    const league = leagueId ? await getLeague(pool, leagueId) : null;
    if (!league) return res.status(404).json({ ok: false, msg: 'Liga no encontrada' });
    const members = await getMembers(pool, league.id);
    const nameById = new Map(members.map((member) => [member.user_id, member.nickname || member.name]));
    const standings = league.status === 'draft' ? [] : (await getStandings(pool, league, members)).entries
      .map((entry) => ({ rank: entry.rank, points: entry.points, matches: entry.matches, matches_target: entry.matches_target, name: entry.user_ids.map((id) => nameById.get(id)).join(' y ') }));
    res.json({
      ok: true,
      rules: league.rules,
      days_left: league.days_left,
      members: members.map(({ user_id: id, name, status }) => ({ id, name, status })),
      standings,
    });
  } catch (error) {
    console.error('[ADMIN FRIEND LEAGUES detail]', error);
    res.status(500).json({ ok: false, msg: 'No se pudo cargar la liga' });
  }
});

export default router;

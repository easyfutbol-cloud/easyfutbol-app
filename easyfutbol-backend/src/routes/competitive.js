import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { ensureSeasonPlayer, getCompetitiveAccess, getCurrentCompetitiveSeason } from '../services/competitiveService.js';

const router = Router();

router.get('/current-season', async (_req, res) => {
  try {
    const season = await getCurrentCompetitiveSeason();
    if (!season) return res.json({ ok:true, data:null });
    const [weeks] = await pool.query('SELECT * FROM competitive_weeks WHERE season_id=? ORDER BY week_number', [season.id]);
    return res.json({ ok:true, data:{ ...season, weeks } });
  } catch (error) { console.error('[GET competitive season]', error); return res.status(500).json({ ok:false, msg:'No se pudo cargar la temporada' }); }
});

router.get('/divisions', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT code,name,tier,color_hex,icon,group_capacity,promotion_slots,relegation_slots FROM competitive_divisions WHERE is_active=1 ORDER BY tier');
    return res.json({ ok:true, data:rows });
  } catch (error) { console.error('[GET divisions]', error); return res.status(500).json({ ok:false, msg:'No se pudieron cargar las divisiones' }); }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await ensureSeasonPlayer(pool, req.user.id);
    return res.json({ ok:true, data:result });
  } catch (error) { console.error('[GET competitive me]', error); return res.status(500).json({ ok:false, msg:'No se pudo consultar tu acceso competitivo' }); }
});

router.get('/access', requireAuth, async (req, res) => {
  try { return res.json({ ok:true, data:await getCompetitiveAccess(pool, req.user.id) }); }
  catch (error) { console.error('[GET competitive access]', error); return res.status(500).json({ ok:false, msg:'No se pudo comprobar el acceso' }); }
});

router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const season=await getCurrentCompetitiveSeason(pool);
    if (!season) return res.json({ ok:true,data:[] });
    const [rows]=await pool.query(
      `SELECT css.position,css.previous_position,css.position_change,css.total_score,css.scored_weeks,
       u.id AS user_id,u.name,d.name AS division_name,d.color_hex
       FROM competitive_season_standings css JOIN users u ON u.id=css.user_id
       JOIN competitive_season_players csp ON csp.season_id=css.season_id AND csp.user_id=css.user_id
       JOIN competitive_divisions d ON d.id=csp.division_id
       JOIN competitive_season_players own ON own.season_id=css.season_id AND own.user_id=?
       WHERE css.season_id=? AND csp.location_id=own.location_id AND csp.division_id=own.division_id
       ORDER BY css.position LIMIT 100`,
      [req.user.id,season.id]
    );
    return res.json({ ok:true,data:rows });
  } catch(error) { console.error('[GET competitive leaderboard]',error); return res.status(500).json({ ok:false,msg:'No se pudo cargar la clasificación' }); }
});

router.get('/me/performance', requireAuth, async (req,res) => {
  try {
    const season=await getCurrentCompetitiveSeason(pool);
    if (!season) return res.json({ ok:true,data:null });
    const [[standing]]=await pool.query('SELECT * FROM competitive_season_standings WHERE season_id=? AND user_id=?',[season.id,req.user.id]);
    const [weeks]=await pool.query(
      `SELECT cw.week_number,cw.status,cws.weekly_score,cws.eligible_matches,cws.best_match_id,
       m.starts_at,f.name AS field_name
       FROM competitive_weeks cw LEFT JOIN competitive_week_scores cws ON cws.week_id=cw.id AND cws.user_id=?
       LEFT JOIN matches m ON m.id=cws.best_match_id LEFT JOIN fields f ON f.id=m.field_id
       WHERE cw.season_id=? ORDER BY cw.week_number`,[req.user.id,season.id]
    );
    return res.json({ ok:true,data:{ standing:standing || null,weeks } });
  } catch(error) { console.error('[GET competitive performance]',error); return res.status(500).json({ ok:false,msg:'No se pudo cargar tu rendimiento' }); }
});

router.get('/me/history', requireAuth, async (req,res) => {
  try {
    const [seasons]=await pool.query(
      `SELECT cs.id,cs.name,cs.starts_at,cs.ends_at,csr.division_position,csr.total_score,csr.outcome,
       d.name AS division_name,d.color_hex,nd.name AS next_division_name,nd.color_hex AS next_division_color
       FROM competitive_season_results csr JOIN competitive_seasons cs ON cs.id=csr.season_id
       JOIN competitive_divisions d ON d.id=csr.division_id JOIN competitive_divisions nd ON nd.id=csr.next_division_id
       WHERE csr.user_id=? ORDER BY cs.ends_at DESC`,[req.user.id]
    );
    const [badges]=await pool.query(
      `SELECT cub.id,b.code,b.name,b.description,b.icon,b.color_hex,cub.awarded_at,cs.name AS season_name
       FROM competitive_user_badges cub JOIN competitive_badges b ON b.id=cub.badge_id
       JOIN competitive_seasons cs ON cs.id=cub.season_id WHERE cub.user_id=? ORDER BY cub.awarded_at DESC`,[req.user.id]
    );
    const [rewards]=await pool.query(
      `SELECT cr.*,cs.name AS season_name FROM competitive_rewards cr JOIN competitive_seasons cs ON cs.id=cr.season_id
       WHERE cr.user_id=? ORDER BY cr.created_at DESC`,[req.user.id]
    );
    return res.json({ ok:true,data:{ seasons,badges,rewards } });
  } catch(error) { console.error('[GET competitive history]',error); return res.status(500).json({ ok:false,msg:'No se pudo cargar el historial competitivo' }); }
});

export default router;

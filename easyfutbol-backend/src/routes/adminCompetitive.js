import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAdmin, requireAuth } from '../middlewares/auth.js';
import { createCompetitiveSeason } from '../services/competitiveService.js';
import {
  getCompetitiveEvaluations,
  listCompetitiveReviewMatches,
  markCompetitiveNotEvaluable,
  saveCompetitiveEvaluation,
} from '../services/competitiveEvaluationService.js';
import { scoreCompetitiveWeek, scoreDueCompetitiveWeeks } from '../services/competitiveScoringService.js';
import { completeCompetitiveSeason, previewCompetitiveSeasonCompletion } from '../services/competitiveSeasonService.js';

const router = Router();

const sendError = (res, error, fallback) => res.status(error?.statusCode || 500).json({ ok:false, msg:error?.message || fallback });

router.get('/seasons/:id/overview', requireAuth, requireAdmin, async (req,res) => {
  try {
    const seasonId=Number(req.params.id);
    const [[season]]=await pool.query('SELECT * FROM competitive_seasons WHERE id=?',[seasonId]);
    if (!season) return res.status(404).json({ ok:false,msg:'Temporada no encontrada' });
    const [weeks]=await pool.query('SELECT * FROM competitive_weeks WHERE season_id=? ORDER BY week_number',[seasonId]);
    const [divisions]=await pool.query('SELECT * FROM competitive_divisions WHERE is_active=1 ORDER BY tier');
    const [locations]=await pool.query('SELECT id,name FROM locations WHERE active=1 ORDER BY name');
    const [players]=await pool.query(
      `SELECT csp.user_id,csp.division_id,csp.location_id,csp.status,csp.access_source,u.name,u.email,
       d.name AS division_name,d.color_hex,l.name AS location_name,COALESCE(css.total_score,0) AS total_score,
       css.position FROM competitive_season_players csp JOIN users u ON u.id=csp.user_id
       JOIN competitive_divisions d ON d.id=csp.division_id LEFT JOIN locations l ON l.id=csp.location_id
       LEFT JOIN competitive_season_standings css ON css.season_id=csp.season_id AND css.user_id=csp.user_id
       WHERE csp.season_id=? ORDER BY l.name,d.tier,css.position,u.name`,[seasonId]
    );
    return res.json({ ok:true,data:{ season,weeks,divisions,locations,players } });
  } catch(error) { console.error('[GET season overview]',error); return sendError(res,error,'No se pudo cargar la temporada'); }
});

router.get('/seasons/:id/preview', requireAuth, requireAdmin, async (req,res) => {
  try { return res.json({ ok:true,data:await previewCompetitiveSeasonCompletion(pool,Number(req.params.id)) }); }
  catch(error) { console.error('[GET season preview]',error); return sendError(res,error,'No se pudo simular el cierre'); }
});

router.patch('/seasons/:id/players/:userId', requireAuth, requireAdmin, async (req,res) => {
  try {
    const seasonId=Number(req.params.id),userId=Number(req.params.userId),divisionId=Number(req.body?.division_id),locationId=Number(req.body?.location_id);
    const [[season]]=await pool.query('SELECT status FROM competitive_seasons WHERE id=?',[seasonId]);
    if (!season) return res.status(404).json({ ok:false,msg:'Temporada no encontrada' });
    if (season.status==='completed') return res.status(409).json({ ok:false,msg:'No se puede editar una temporada completada' });
    const [[division]]=await pool.query('SELECT id FROM competitive_divisions WHERE id=? AND is_active=1',[divisionId]);
    const [[location]]=await pool.query('SELECT id FROM locations WHERE id=? AND active=1',[locationId]);
    if (!division || !location) return res.status(400).json({ ok:false,msg:'División o ciudad no válida' });
    const [result]=await pool.query('UPDATE competitive_season_players SET division_id=?,location_id=? WHERE season_id=? AND user_id=?',[divisionId,locationId,seasonId,userId]);
    if (!result.affectedRows) return res.status(404).json({ ok:false,msg:'Jugador no inscrito en la temporada' });
    return res.json({ ok:true,msg:'Asignación actualizada' });
  } catch(error) { console.error('[PATCH season player]',error); return sendError(res,error,'No se pudo actualizar la asignación'); }
});

router.post('/seasons/:id/complete', requireAuth, requireAdmin, async (req,res) => {
  const conn=await pool.getConnection();
  try { await conn.beginTransaction(); const data=await completeCompetitiveSeason(conn,Number(req.params.id),req.user.id); await conn.commit(); return res.json({ ok:true,data }); }
  catch(error) { await conn.rollback(); console.error('[POST complete season]',error); return sendError(res,error,'No se pudo cerrar la temporada'); }
  finally { conn.release(); }
});

router.post('/weeks/score-due', requireAuth, requireAdmin, async (_req,res) => {
  try { return res.json({ ok:true,data:await scoreDueCompetitiveWeeks(pool) }); }
  catch(error) { console.error('[POST score due weeks]',error); return sendError(res,error,'No se pudieron cerrar las semanas'); }
});

router.post('/weeks/:id/score', requireAuth, requireAdmin, async (req,res) => {
  const conn=await pool.getConnection();
  try { await conn.beginTransaction(); const data=await scoreCompetitiveWeek(conn,Number(req.params.id),{ force:req.body?.force===true }); await conn.commit(); return res.json({ ok:true,data }); }
  catch(error) { await conn.rollback(); console.error('[POST score week]',error); return sendError(res,error,'No se pudo cerrar la semana'); }
  finally { conn.release(); }
});

router.get('/matches', requireAuth, requireAdmin, async (_req, res) => {
  try { return res.json({ ok:true, data:await listCompetitiveReviewMatches(pool) }); }
  catch (error) { console.error('[GET competitive review matches]', error); return sendError(res, error, 'No se pudieron cargar los partidos'); }
});

router.get('/matches/:id/evaluations', requireAuth, requireAdmin, async (req, res) => {
  try { return res.json({ ok:true, data:await getCompetitiveEvaluations(pool, Number(req.params.id)) }); }
  catch (error) { console.error('[GET competitive evaluations]', error); return sendError(res, error, 'No se pudieron cargar las valoraciones'); }
});

router.put('/evaluations/:id', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const data = await saveCompetitiveEvaluation(conn, Number(req.params.id), req.body, req.user.id); await conn.commit(); return res.json({ ok:true, data }); }
  catch (error) { await conn.rollback(); console.error('[PUT competitive evaluation]', error); return sendError(res, error, 'No se pudo guardar la valoración'); }
  finally { conn.release(); }
});

router.put('/matches/:id/evaluations', requireAuth, requireAdmin, async (req, res) => {
  const entries = req.body?.evaluations;
  if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ ok:false, msg:'No hay valoraciones para guardar' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const results = [];
    for (const entry of entries) results.push(await saveCompetitiveEvaluation(conn, Number(entry.id), entry, req.user.id));
    await conn.commit();
    return res.json({ ok:true, data:results });
  } catch (error) { await conn.rollback(); console.error('[PUT bulk competitive evaluations]', error); return sendError(res, error, 'No se pudieron guardar las valoraciones'); }
  finally { conn.release(); }
});

router.post('/evaluations/:id/not-evaluable', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const data = await markCompetitiveNotEvaluable(conn, Number(req.params.id), req.body, req.user.id); await conn.commit(); return res.json({ ok:true, data }); }
  catch (error) { await conn.rollback(); console.error('[POST competitive not evaluable]', error); return sendError(res, error, 'No se pudo marcar al jugador'); }
  finally { conn.release(); }
});

router.get('/evaluations/:id/history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT cer.*,u.name AS changed_by_name FROM competitive_evaluation_revisions cer
       JOIN users u ON u.id=cer.changed_by WHERE cer.evaluation_id=? ORDER BY cer.revision_number DESC`,
      [Number(req.params.id)]
    );
    return res.json({ ok:true, data:rows });
  } catch (error) { console.error('[GET evaluation history]', error); return sendError(res, error, 'No se pudo cargar el historial'); }
});

router.get('/seasons', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT cs.*,
        (SELECT COUNT(*) FROM competitive_season_players csp WHERE csp.season_id=cs.id) AS players,
        (SELECT COUNT(*) FROM competitive_weeks cw WHERE cw.season_id=cs.id) AS weeks
       FROM competitive_seasons cs ORDER BY cs.starts_at DESC`
    );
    return res.json({ ok:true, data:rows });
  } catch (error) { console.error('[GET admin competitive seasons]', error); return res.status(500).json({ ok:false, msg:'No se pudieron cargar las temporadas' }); }
});

router.post('/seasons', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const name = String(req.body?.name || '').trim();
    const code = String(req.body?.code || '').trim().toLowerCase();
    if (!name || !/^[a-z0-9_-]{3,40}$/.test(code) || !req.body?.starts_at) {
      return res.status(400).json({ ok:false, msg:'Nombre, código y fecha de inicio son obligatorios' });
    }
    await conn.beginTransaction();
    const season = await createCompetitiveSeason(conn, { name, code, startsAt:req.body.starts_at, createdBy:req.user.id });
    await conn.commit();
    return res.status(201).json({ ok:true, data:season });
  } catch (error) {
    await conn.rollback();
    console.error('[POST competitive season]', error);
    return res.status(error?.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ ok:false, msg:error?.code === 'ER_DUP_ENTRY' ? 'Ya existe una temporada con ese código' : error.message || 'No se pudo crear la temporada' });
  } finally { conn.release(); }
});

router.post('/seasons/:id/activate', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const seasonId = Number(req.params.id);
    await conn.beginTransaction();
    const [[season]] = await conn.query('SELECT * FROM competitive_seasons WHERE id=? FOR UPDATE', [seasonId]);
    if (!season) { await conn.rollback(); return res.status(404).json({ ok:false, msg:'Temporada no encontrada' }); }
    const [[other]] = await conn.query("SELECT id FROM competitive_seasons WHERE status IN ('active','scoring') AND id<>? LIMIT 1", [seasonId]);
    if (other) { await conn.rollback(); return res.status(409).json({ ok:false, msg:'Ya hay otra temporada activa' }); }
    const [divisions] = await conn.query('SELECT id,group_capacity FROM competitive_divisions WHERE is_active=1');
    const [locations] = await conn.query('SELECT id FROM locations WHERE active=1');
    for (const division of divisions) for (const location of locations) {
      await conn.query(
        `INSERT IGNORE INTO competitive_division_groups (season_id,division_id,location_id,group_number,capacity)
         VALUES (?,?,?,?,?)`,
        [seasonId, division.id, location.id, 1, division.group_capacity]
      );
    }
    await conn.query("UPDATE competitive_seasons SET status='active',activated_at=NOW() WHERE id=?", [seasonId]);
    await conn.commit();
    return res.json({ ok:true, msg:'Temporada activada' });
  } catch (error) { await conn.rollback(); console.error('[POST activate season]', error); return res.status(500).json({ ok:false, msg:'No se pudo activar la temporada' }); }
  finally { conn.release(); }
});

export default router;

// src/routes/adminNotify.js
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { pool } from '../config/db.js';
import { getCityPushTokens, getMatchPushTokens, getSegmentPushAudience, getUserPushToken, notificationSegments, sendExpoPush } from '../services/push.js';
import { sendMatchReminders } from '../services/reminderService.js';
import { madridWallTimeToUtc,toMysqlUtc } from '../utils/madridDateTime.js';
import { sendNotificationCampaign } from '../services/notificationCampaignService.js';

const router = Router();
const templates=[
  {id:'field_change',label:'Cambio de campo',title:'Cambio de campo',body:'Tu partido cambia de campo. Revisa los detalles actualizados en EasyFutbol.'},
  {id:'time_change',label:'Cambio de horario',title:'Cambio de horario',body:'El horario de tu partido ha cambiado. Consulta la nueva hora en EasyFutbol.'},
  {id:'cancelled',label:'Partido cancelado',title:'Partido cancelado',body:'Tu partido ha sido cancelado. Abre EasyFutbol para consultar los detalles.'},
  {id:'last_spots',label:'Últimas plazas',title:'¡Últimas plazas!',body:'Quedan pocas plazas para el próximo partido. Reserva la tuya antes de que se agoten.'},
  {id:'reminder',label:'Recordatorio',title:'Tu partido está cerca',body:'Recuerda revisar la hora, el campo y el color de camiseta de tu próximo partido.'},
];

async function resolveTarget(targetType,targetId){
  if(targetType==='city'){const[[row]]=await pool.query('SELECT slug id,name FROM locations WHERE slug=? AND active=1 LIMIT 1',[String(targetId)]);return row;}
  if(targetType==='match'){const[[row]]=await pool.query('SELECT id,title name FROM matches WHERE id=? LIMIT 1',[Number(targetId)]);return row;}
  if(targetType==='segment')return notificationSegments.find(segment=>segment.id===String(targetId))||null;
  return null;
}

async function createCampaign({adminId,targetType,targetId,targetName,title,body,tokens}) {
  const [result]=await pool.query(`INSERT INTO notification_campaigns(created_by,target_type,target_id,target_name,title,body,token_count) VALUES (?,?,?,?,?,?,?)`,[adminId,targetType,String(targetId),targetName,title,body,tokens]);
  return result.insertId;
}
async function finishCampaign(id,{sent=0,failed=0}={}){await pool.query("UPDATE notification_campaigns SET status='sent',sent_at=NOW(),accepted_count=?,rejected_count=? WHERE id=?",[sent,failed,id]);}

router.get('/admin/notify/options', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [locations] = await pool.query(
      `SELECT id, name, slug
       FROM locations
       WHERE active = 1
       ORDER BY name ASC`
    );
    const [matches] = await pool.query(
      `SELECT m.id, m.title, m.city, m.starts_at, m.status, f.name AS field_name
       FROM matches m
       LEFT JOIN fields f ON f.id = m.field_id
       WHERE m.status <> 'cancelled'
         AND m.starts_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY m.starts_at DESC
       LIMIT 100`
    );
    const [[diagnostics]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM push_tokens WHERE is_active=1) active_tokens,
        SUM(created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) attempts_24h,
        SUM(status='delivered' AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) delivered_24h,
        SUM(status='error' AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) errors_24h,
        SUM(status='queued' AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)) pending_24h
       FROM push_delivery_receipts`
    );
    return res.json({ ok: true, data: { locations, matches, diagnostics, templates, segments:notificationSegments } });
  } catch (e) {
    console.error('Error cargando opciones de notificación', e);
    return res.status(500).json({ ok: false, msg: 'Error cargando destinatarios' });
  }
});

router.get('/admin/notify/segments/:id/preview',requireAuth,requireAdmin,async(req,res)=>{try{const segment=notificationSegments.find(item=>item.id===req.params.id);if(!segment)return res.status(404).json({ok:false,msg:'Segmento no encontrado'});const audience=await getSegmentPushAudience(segment.id);res.json({ok:true,segment,audience:{users:audience.users,devices:audience.tokens.length}});}catch(error){console.error('[SEGMENT PREVIEW]',error);res.status(500).json({ok:false,msg:'No se pudo calcular el alcance'});}});

router.post('/admin/notify/segment/:id',requireAuth,requireAdmin,async(req,res)=>{try{const segment=notificationSegments.find(item=>item.id===req.params.id),title=String(req.body?.title||'').trim(),body=String(req.body?.body||'').trim();if(!segment)return res.status(404).json({ok:false,msg:'Segmento no encontrado'});if(!title||!body)return res.status(400).json({ok:false,msg:'Título y mensaje son obligatorios'});const audience=await getSegmentPushAudience(segment.id);const campaignId=await createCampaign({adminId:req.user.id,targetType:'segment',targetId:segment.id,targetName:segment.name,title:title.slice(0,65),body:body.slice(0,220),tokens:audience.tokens.length});const delivery=await sendExpoPush(audience.tokens,title,body,{type:'news',campaignId,segment:segment.id});await finishCampaign(campaignId,delivery);res.json({ok:true,...delivery,campaignId,tokens:audience.tokens.length,users:audience.users,target:segment.name});}catch(error){console.error('[SEGMENT SEND]',error);res.status(500).json({ok:false,msg:'No se pudo enviar al segmento'});}});

router.get('/admin/notify/history',requireAuth,requireAdmin,async(_req,res)=>{
  try{const[items]=await pool.query(`SELECT c.id,c.target_type,c.target_id,c.target_name,c.title,c.body,c.status,c.scheduled_at,c.sent_at,c.failure_message,c.token_count,c.accepted_count,c.rejected_count,c.created_at,u.name created_by_name,SUM(r.status='delivered') delivered_count,SUM(r.status='queued') pending_count,SUM(r.status='error') error_count FROM notification_campaigns c LEFT JOIN users u ON u.id=c.created_by LEFT JOIN push_delivery_receipts r ON r.campaign_id=c.id GROUP BY c.id,u.name ORDER BY COALESCE(c.scheduled_at,c.created_at) DESC LIMIT 50`);res.json({ok:true,items:items.map(item=>({...item,delivered_count:Number(item.delivered_count||0),pending_count:Number(item.pending_count||0),error_count:Number(item.error_count||0)}))});}
  catch(error){console.error('[NOTIFY HISTORY]',error);res.status(500).json({ok:false,msg:'No se pudo cargar el historial'});}
});

router.post('/admin/notify/campaigns',requireAuth,requireAdmin,async(req,res)=>{
  try{
    const targetType=String(req.body?.target_type||''),targetId=req.body?.target_id,title=String(req.body?.title||'').trim(),body=String(req.body?.body||'').trim(),mode=String(req.body?.mode||'draft');
    if(!['city','match','segment'].includes(targetType)||!['draft','scheduled'].includes(mode)||!title||!body)return res.status(400).json({ok:false,msg:'Campaña no válida'});
    const target=await resolveTarget(targetType,targetId);if(!target)return res.status(404).json({ok:false,msg:'Destinatario no encontrado'});
    let scheduledAt=null;
    if(mode==='scheduled'){const instant=madridWallTimeToUtc(req.body?.schedule_date,req.body?.schedule_time);if(!instant||instant<=new Date())return res.status(400).json({ok:false,msg:'Selecciona una fecha futura válida en horario de Madrid'});scheduledAt=toMysqlUtc(instant);}
    const[result]=await pool.query(`INSERT INTO notification_campaigns(created_by,target_type,target_id,target_name,title,body,status,scheduled_at) VALUES (?,?,?,?,?,?,?,?)`,[req.user.id,targetType,String(target.id),target.name,title.slice(0,65),body.slice(0,220),mode,scheduledAt]);
    res.status(201).json({ok:true,id:result.insertId,status:mode,scheduled_at:scheduledAt});
  }catch(error){console.error('[CREATE NOTIFICATION CAMPAIGN]',error);res.status(500).json({ok:false,msg:'No se pudo guardar la campaña'});}
});
router.patch('/admin/notify/campaigns/:id',requireAuth,requireAdmin,async(req,res)=>{
  try{const id=Number(req.params.id),title=String(req.body?.title||'').trim(),body=String(req.body?.body||'').trim(),mode=String(req.body?.mode||'draft');if(!id||!title||!body||!['draft','scheduled'].includes(mode))return res.status(400).json({ok:false,msg:'Datos no válidos'});let scheduledAt=null;if(mode==='scheduled'){const instant=madridWallTimeToUtc(req.body?.schedule_date,req.body?.schedule_time);if(!instant||instant<=new Date())return res.status(400).json({ok:false,msg:'Fecha programada no válida'});scheduledAt=toMysqlUtc(instant);}const[result]=await pool.query(`UPDATE notification_campaigns SET title=?,body=?,status=?,scheduled_at=? WHERE id=? AND status IN ('draft','scheduled')`,[title.slice(0,65),body.slice(0,220),mode,scheduledAt,id]);if(!result.affectedRows)return res.status(409).json({ok:false,msg:'La campaña ya no se puede editar'});res.json({ok:true});}catch(error){res.status(500).json({ok:false,msg:'No se pudo editar la campaña'});}
});
router.post('/admin/notify/campaigns/:id/send',requireAuth,requireAdmin,async(req,res)=>{try{const result=await sendNotificationCampaign(Number(req.params.id),{force:true});if(!result.ok)return res.status(409).json({ok:false,msg:'La campaña ya fue procesada'});res.json(result);}catch(error){res.status(500).json({ok:false,msg:'No se pudo enviar la campaña'});}});
router.delete('/admin/notify/campaigns/:id',requireAuth,requireAdmin,async(req,res)=>{try{const[result]=await pool.query(`UPDATE notification_campaigns SET status='cancelled' WHERE id=? AND status IN ('draft','scheduled')`,[Number(req.params.id)]);if(!result.affectedRows)return res.status(409).json({ok:false,msg:'La campaña ya no se puede cancelar'});res.json({ok:true});}catch(error){res.status(500).json({ok:false,msg:'No se pudo cancelar la campaña'});}});

/** Enviar aviso a todos los jugadores de una sede/ciudad preferida. */
router.post('/admin/notify/city/:slug', requireAuth, requireAdmin, async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const { title, body, data } = req.body || {};
    if (!slug) return res.status(400).json({ ok: false, msg: 'Falta la ciudad' });
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ ok: false, msg: 'Título y mensaje son obligatorios' });

    const [[location]] = await pool.query(
      'SELECT id, name, slug FROM locations WHERE LOWER(slug) = ? AND active = 1 LIMIT 1',
      [slug]
    );
    if (!location) return res.status(404).json({ ok: false, msg: 'Ciudad no encontrada' });

    const tokens = await getCityPushTokens(location.slug);
    const cleanTitle=title.trim(),cleanBody=body.trim();
    const campaignId=await createCampaign({adminId:req.user.id,targetType:'city',targetId:location.slug,targetName:location.name,title:cleanTitle,body:cleanBody,tokens:tokens.length});
    const delivery = await sendExpoPush(tokens, cleanTitle, cleanBody, {
      type: 'city',
      campaignId,
      locationId: Number(location.id),
      locationSlug: location.slug,
      ...(data || {}),
    });
    await finishCampaign(campaignId,delivery);
    return res.json({ ok: true, ...delivery, campaignId, tokens: tokens.length, target: location.name });
  } catch (e) {
    console.error('Error enviando notificación por ciudad', e);
    return res.status(500).json({ ok: false, msg: 'Error enviando notificación' });
  }
});

/** Enviar aviso a TODOS los confirmados de un partido */
router.post('/admin/notify/match/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { title, body, data } = req.body || {};
    if (!Number.isInteger(matchId) || matchId <= 0) return res.status(400).json({ ok:false, msg:'Partido inválido' });
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ ok:false, msg:'Título y mensaje son obligatorios' });

    const [[match]] = await pool.query('SELECT id, title FROM matches WHERE id = ? LIMIT 1', [matchId]);
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const tokens = await getMatchPushTokens(matchId);
    const cleanTitle=title.trim(),cleanBody=body.trim();
    const campaignId=await createCampaign({adminId:req.user.id,targetType:'match',targetId:matchId,targetName:match.title,title:cleanTitle,body:cleanBody,tokens:tokens.length});
    const delivery=await sendExpoPush(tokens, cleanTitle, cleanBody, { type: 'match', campaignId, matchId, screen: 'Match', ...(data || {}) });
    await finishCampaign(campaignId,delivery);

    res.json({ ok:true, ...delivery, campaignId, tokens: tokens.length, target: match.title });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error enviando notificación' });
  }
});

/** Lanzar manualmente los recordatorios de partidos (4h antes por defecto) */
router.post('/admin/notify/send-reminders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { hoursAhead, windowMinutes } = req.body || {};

    const result = await sendMatchReminders({
      hoursAhead: Number.isFinite(Number(hoursAhead)) ? Number(hoursAhead) : 4,
      windowMinutes: Number.isFinite(Number(windowMinutes)) ? Number(windowMinutes) : 10,
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error enviando recordatorios' });
  }
});

/** Enviar aviso a un usuario concreto */
router.post('/admin/notify/user/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { title, body, data } = req.body || {};
    if (!title || !body) return res.status(400).json({ ok:false, msg:'Faltan title y body' });

    const token = await getUserPushToken(userId);
    if (!token) return res.status(404).json({ ok:false, msg:'Usuario sin token push' });

    const[[user]]=await pool.query('SELECT name FROM users WHERE id=?',[userId]);
    const campaignId=await createCampaign({adminId:req.user.id,targetType:'user',targetId:userId,targetName:user?.name||`Usuario #${userId}`,title:String(title).trim(),body:String(body).trim(),tokens:1});
    const delivery=await sendExpoPush([token], title, body, { type: 'direct', campaignId, userId, ...(data || {}) });
    await finishCampaign(campaignId,delivery);
    res.json({ ok:true,...delivery,campaignId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error enviando notificación' });
  }
});

export default router;

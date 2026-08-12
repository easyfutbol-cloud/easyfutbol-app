import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { areFriends, createSocialNotification, expireMatchInvitations, getFriendshipStatus, positiveId } from '../services/socialService.js';
import { getBestTeammates, getFrequentPlayers, getPairStats } from '../services/socialStatsService.js';
import { getPlayerReputation, publicReputation } from '../services/playerReputationService.js';

const router = Router();
router.use(requireAuth);
const pageArgs = (query) => {
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  const page = Math.max(Number(query.page) || 1, 1);
  return { limit, offset:(page - 1) * limit, page };
};
const fail = (res, code, msg) => res.status(code).json({ ok:false, msg });
const isBlocked = async (db,userId,otherId) => {
  const [[row]]=await db.query('SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1',[userId,otherId,otherId,userId]);
  return Boolean(row);
};

router.get('/privacy/me', async (req,res) => {
  try {
    await pool.query('INSERT IGNORE INTO user_social_privacy(user_id) VALUES (?)',[req.user.id]);
    const [[privacy]]=await pool.query('SELECT show_upcoming_to_friends,show_stats_to_friends FROM user_social_privacy WHERE user_id=?',[req.user.id]);
    const [blocked]=await pool.query('SELECT u.id,u.name,u.avatar_url,b.created_at FROM user_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=? ORDER BY b.created_at DESC',[req.user.id]);
    res.json({ok:true,privacy:{show_upcoming_to_friends:Boolean(privacy.show_upcoming_to_friends),show_stats_to_friends:Boolean(privacy.show_stats_to_friends)},blocked});
  } catch(error){console.error('[SOCIAL privacy]',error);fail(res,500,'No se pudo cargar la privacidad');}
});
router.patch('/privacy/me', async (req,res) => {
  try { const upcoming=req.body?.show_upcoming_to_friends?1:0,stats=req.body?.show_stats_to_friends?1:0; await pool.query(`INSERT INTO user_social_privacy(user_id,show_upcoming_to_friends,show_stats_to_friends) VALUES (?,?,?) ON DUPLICATE KEY UPDATE show_upcoming_to_friends=VALUES(show_upcoming_to_friends),show_stats_to_friends=VALUES(show_stats_to_friends)`,[req.user.id,upcoming,stats]);res.json({ok:true}); }
  catch(error){console.error('[SOCIAL privacy update]',error);fail(res,500,'No se pudo guardar la privacidad');}
});
router.post('/blocks/:userId', async (req,res) => {
  const otherId=positiveId(req.params.userId);if(!otherId||otherId===Number(req.user.id))return fail(res,400,'Usuario no válido');
  const conn=await pool.getConnection();try{await conn.beginTransaction();await conn.query('INSERT IGNORE INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)',[req.user.id,otherId]);await conn.query(`UPDATE friendships SET status='cancelled' WHERE user_low_id=LEAST(?,?) AND user_high_id=GREATEST(?,?)`,[req.user.id,otherId,req.user.id,otherId]);await conn.query(`UPDATE match_invitations SET status='declined' WHERE status IN ('pending','viewed') AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))`,[req.user.id,otherId,otherId,req.user.id]);await conn.commit();res.json({ok:true});}catch(error){await conn.rollback();console.error('[SOCIAL block]',error);fail(res,500,'No se pudo bloquear');}finally{conn.release();}
});
router.delete('/blocks/:userId', async (req,res) => { try{await pool.query('DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?',[req.user.id,positiveId(req.params.userId)]);res.json({ok:true});}catch(error){fail(res,500,'No se pudo desbloquear');} });
router.post('/reports', async (req,res) => {
  const otherId=positiveId(req.body?.user_id),reason=req.body?.reason,details=String(req.body?.details||'').trim().slice(0,500);if(!otherId||otherId===Number(req.user.id)||!['conduct','harassment','spam','identity','other'].includes(reason))return fail(res,400,'Denuncia no válida');
  try{const[r]=await pool.query('INSERT INTO user_reports(reporter_id,reported_id,reason,details) VALUES (?,?,?,?)',[req.user.id,otherId,reason,details||null]);res.status(201).json({ok:true,id:r.insertId,msg:'Denuncia enviada de forma privada'});}catch(error){console.error('[SOCIAL report]',error);fail(res,500,'No se pudo enviar la denuncia');}
});
router.get('/admin/reports', requireAdmin, async (req,res) => {
  try { const status=String(req.query.status||'open');const allowed=['open','reviewing','resolved','dismissed'];const filter=allowed.includes(status)?status:'open';const [rows]=await pool.query(`SELECT r.id,r.reason,r.details,r.status,r.created_at,r.reviewed_at,reporter.id reporter_id,reporter.name reporter_name,reporter.avatar_url reporter_avatar,reported.id reported_id,reported.name reported_name,reported.avatar_url reported_avatar,reviewer.name reviewer_name FROM user_reports r JOIN users reporter ON reporter.id=r.reporter_id JOIN users reported ON reported.id=r.reported_id LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by WHERE r.status=? ORDER BY r.created_at DESC LIMIT 200`,[filter]);res.json({ok:true,items:rows}); }
  catch(error){console.error('[ADMIN SOCIAL REPORTS]',error);fail(res,500,'No se pudieron cargar las denuncias');}
});
router.patch('/admin/reports/:id/status', requireAdmin, async (req,res) => {
  const status=req.body?.status;if(!['reviewing','resolved','dismissed'].includes(status))return fail(res,400,'Estado no válido');
  try{const[r]=await pool.query(`UPDATE user_reports SET status=?,reviewed_by=?,reviewed_at=IF(? IN ('resolved','dismissed'),NOW(),NULL) WHERE id=?`,[status,req.user.id,status,positiveId(req.params.id)]);if(!r.affectedRows)return fail(res,404,'Denuncia no encontrada');res.json({ok:true,status});}catch(error){console.error('[ADMIN REPORT STATUS]',error);fail(res,500,'No se pudo actualizar');}
});

router.get('/summary', async (req,res) => {
  try {
    const userId=req.user.id;
    const [[counts]]=await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM friendships WHERE status='accepted' AND (requester_id=? OR addressee_id=?)) friends,
        (SELECT COUNT(*) FROM friendships WHERE status='pending' AND addressee_id=?) pending_requests,
        (SELECT COUNT(*) FROM match_invitations WHERE receiver_id=? AND status IN ('pending','viewed')) match_invitations,
        (SELECT COUNT(*) FROM friend_group_members WHERE user_id=?) groups_count`,
      [userId,userId,userId,userId,userId]
    );
    res.json({ok:true,...counts});
  } catch(error) { console.error('[SOCIAL summary]',error); fail(res,500,'No se pudo cargar el resumen social'); }
});

router.get('/friends', async (req,res) => {
  try {
    const userId=req.user.id,{limit,offset,page}=pageArgs(req.query);
    const [rows]=await pool.query(
      `SELECT f.id friendship_id,f.created_at friendship_since,u.id,u.name,u.avatar_url,u.preferred_location
       FROM friendships f JOIN users u ON u.id=IF(f.requester_id=?,f.addressee_id,f.requester_id)
       WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?)
       ORDER BY u.name ASC LIMIT ? OFFSET ?`,[userId,userId,userId,limit,offset]
    );
    res.json({ok:true,items:rows,page,has_more:rows.length===limit});
  } catch(error) { console.error('[SOCIAL friends]',error); fail(res,500,'No se pudieron cargar tus amigos'); }
});

router.get('/friends/matches', async (req,res) => {
  try {
    const userId=req.user.id;
    const [rows]=await pool.query(
      `SELECT m.id match_id,m.title,m.starts_at,m.capacity,m.spots_taken,
              u.id friend_id,u.name friend_name,u.avatar_url friend_avatar,i.ticket_type
       FROM friendships f
       JOIN users u ON u.id=IF(f.requester_id=?,f.addressee_id,f.requester_id)
       LEFT JOIN user_social_privacy usp ON usp.user_id=u.id
       JOIN inscriptions i ON i.user_id=u.id AND i.status IN ('pending','confirmed')
       JOIN matches m ON m.id=i.match_id
       WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?)
         AND m.starts_at>NOW() AND m.status<>'cancelled'
         AND COALESCE(usp.show_upcoming_to_friends,1)=1
         AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
       ORDER BY m.starts_at ASC,u.name ASC`,
      [userId,userId,userId,userId,userId]
    );
    res.json({ok:true,items:rows});
  } catch(error) { console.error('[SOCIAL friend matches]',error); fail(res,500,'No se pudieron cargar los partidos de tus amigos'); }
});

router.get('/friends/stats', async (req,res) => {
  try {
    const userId=req.user.id;
    const [rows]=await pool.query(
      `SELECT u.id,u.name,u.avatar_url,u.preferred_location,
              COALESCE(SUM(mps.goals),0) goals,
              COALESCE(SUM(mps.assists),0) assists,
              COALESCE(SUM(mps.result='win'),0) wins
       FROM friendships f
       JOIN users u ON u.id=IF(f.requester_id=?,f.addressee_id,f.requester_id)
       LEFT JOIN user_social_privacy usp ON usp.user_id=u.id
       LEFT JOIN match_player_stats mps ON mps.user_id=u.id
       WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?)
         AND COALESCE(usp.show_stats_to_friends,1)=1
         AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
       GROUP BY u.id,u.name,u.avatar_url,u.preferred_location
       ORDER BY wins DESC,goals DESC,assists DESC,u.name ASC`,
      [userId,userId,userId,userId,userId]
    );
    res.json({ok:true,items:rows.map((row)=>({...row,goals:Number(row.goals),assists:Number(row.assists),wins:Number(row.wins)}))});
  } catch(error) { console.error('[SOCIAL friend stats]',error); fail(res,500,'No se pudieron cargar las estadísticas de tus amigos'); }
});

router.get('/requests/:direction(received|sent)', async (req,res) => {
  try {
    const received=req.params.direction==='received',userId=req.user.id;
    const [rows]=await pool.query(
      `SELECT f.id friendship_id,f.created_at,u.id,u.name,u.avatar_url,u.preferred_location
       FROM friendships f JOIN users u ON u.id=${received?'f.requester_id':'f.addressee_id'}
       WHERE f.status='pending' AND ${received?'f.addressee_id':'f.requester_id'}=? ORDER BY f.created_at DESC`,[userId]
    );
    res.json({ok:true,items:rows});
  } catch(error) { console.error('[SOCIAL requests]',error); fail(res,500,'No se pudieron cargar las solicitudes'); }
});

router.get('/users/search', async (req,res) => {
  try {
    const userId=req.user.id,q=String(req.query.q||'').trim(),{limit,offset,page}=pageArgs(req.query);
    if (q.length<2) return res.json({ok:true,items:[],page,has_more:false});
    const like=`%${q.replace(/[\\%_]/g,'\\$&')}%`;
    const [rows]=await pool.query(
      `SELECT u.id,u.name,u.avatar_url,u.preferred_location,
        CASE WHEN f.status='accepted' THEN 'friends' WHEN f.status='pending' AND f.requester_id=? THEN 'sent'
             WHEN f.status='pending' THEN 'received' ELSE 'none' END friendship_status,f.id friendship_id
       FROM users u LEFT JOIN friendships f ON f.user_low_id=LEAST(?,u.id) AND f.user_high_id=GREATEST(?,u.id)
       WHERE u.id<>? AND (u.name LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\' OR u.id=?)
         AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
       ORDER BY CASE WHEN u.name LIKE ? THEN 0 ELSE 1 END,u.name LIMIT ? OFFSET ?`,
      [userId,userId,userId,userId,like,like,positiveId(q)||0,userId,userId,`${q}%`,limit,offset]
    );
    res.json({ok:true,items:rows,page,has_more:rows.length===limit});
  } catch(error) { console.error('[SOCIAL search]',error); fail(res,500,'No se pudo completar la búsqueda'); }
});

router.get('/users/:userId/status', async (req,res) => {
  const otherId=positiveId(req.params.userId); if (!otherId) return fail(res,400,'Usuario no válido');
  try { res.json({ok:true,...await getFriendshipStatus(pool,req.user.id,otherId)}); }
  catch(error) { console.error('[SOCIAL status]',error); fail(res,500,'No se pudo consultar la relación'); }
});

router.post('/requests', async (req,res) => {
  const otherId=positiveId(req.body?.user_id); if (!otherId || otherId===Number(req.user.id)) return fail(res,400,'Usuario no válido');
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    if(await isBlocked(conn,req.user.id,otherId)){await conn.rollback();return fail(res,403,'No se puede enviar esta solicitud');}
    const [[user]]=await conn.query('SELECT id,name FROM users WHERE id=? LIMIT 1',[otherId]);
    if (!user) { await conn.rollback(); return fail(res,404,'Usuario no encontrado'); }
    const [[existing]]=await conn.query('SELECT * FROM friendships WHERE user_low_id=LEAST(?,?) AND user_high_id=GREATEST(?,?) FOR UPDATE',[req.user.id,otherId,req.user.id,otherId]);
    if (existing?.status==='accepted') { await conn.rollback(); return fail(res,409,'Ya sois amigos'); }
    if (existing?.status==='pending') { await conn.rollback(); return fail(res,409,'Ya existe una solicitud pendiente'); }
    let friendshipId;
    if (existing) {
      await conn.query(`UPDATE friendships SET requester_id=?,addressee_id=?,status='pending',created_at=NOW() WHERE id=?`,[req.user.id,otherId,existing.id]); friendshipId=existing.id;
    } else {
      const [result]=await conn.query(`INSERT INTO friendships(requester_id,addressee_id) VALUES (?,?)`,[req.user.id,otherId]); friendshipId=result.insertId;
    }
    const [[actor]]=await conn.query('SELECT name FROM users WHERE id=?',[req.user.id]);
    await createSocialNotification(conn,{userId:otherId,actorId:req.user.id,type:'friend_request',entityType:'friendship',entityId:friendshipId,title:'Nueva solicitud de amistad',body:`${actor.name} quiere añadirte como amigo`,data:{screen:'Social',tab:'requests'},dedupeKey:`friend-request:${friendshipId}:${Date.now()}`});
    await conn.commit(); res.status(201).json({ok:true,friendship_id:friendshipId,status:'sent'});
  } catch(error) { await conn.rollback(); console.error('[SOCIAL request]',error); fail(res,500,'No se pudo enviar la solicitud'); }
  finally { conn.release(); }
});

router.patch('/requests/:id/:action(accept|reject)', async (req,res) => {
  const id=positiveId(req.params.id); if (!id) return fail(res,400,'Solicitud no válida');
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]]=await conn.query(`SELECT * FROM friendships WHERE id=? AND addressee_id=? FOR UPDATE`,[id,req.user.id]);
    if (!row || row.status!=='pending') { await conn.rollback(); return fail(res,404,'Solicitud pendiente no encontrada'); }
    const status=req.params.action==='accept'?'accepted':'rejected';
    await conn.query('UPDATE friendships SET status=? WHERE id=?',[status,id]);
    if (status==='accepted') {
      const [[actor]]=await conn.query('SELECT name FROM users WHERE id=?',[req.user.id]);
      await createSocialNotification(conn,{userId:row.requester_id,actorId:req.user.id,type:'friend_accepted',entityType:'friendship',entityId:id,title:'Solicitud aceptada',body:`${actor.name} ya es tu amigo`,data:{screen:'PlayerSocialProfile',userId:req.user.id},dedupeKey:`friend-accepted:${id}`});
    }
    await conn.commit(); res.json({ok:true,status});
  } catch(error) { await conn.rollback(); console.error('[SOCIAL request action]',error); fail(res,500,'No se pudo actualizar la solicitud'); }
  finally { conn.release(); }
});

router.delete('/requests/:id', async (req,res) => {
  try {
    const [result]=await pool.query(`UPDATE friendships SET status='cancelled' WHERE id=? AND requester_id=? AND status='pending'`,[positiveId(req.params.id),req.user.id]);
    if (!result.affectedRows) return fail(res,404,'Solicitud enviada no encontrada'); res.json({ok:true});
  } catch(error) { console.error('[SOCIAL cancel request]',error); fail(res,500,'No se pudo cancelar la solicitud'); }
});

router.delete('/friends/:userId', async (req,res) => {
  try {
    const [result]=await pool.query(`UPDATE friendships SET status='cancelled' WHERE status='accepted' AND user_low_id=LEAST(?,?) AND user_high_id=GREATEST(?,?)`,[req.user.id,positiveId(req.params.userId),req.user.id,positiveId(req.params.userId)]);
    if (!result.affectedRows) return fail(res,404,'Amistad no encontrada'); res.json({ok:true});
  } catch(error) { console.error('[SOCIAL remove friend]',error); fail(res,500,'No se pudo eliminar la amistad'); }
});

router.get('/users/:userId/stats', async (req,res) => {
  const otherId=positiveId(req.params.userId); if (!otherId) return fail(res,400,'Usuario no válido');
  try {
    if(await isBlocked(pool,req.user.id,otherId))return fail(res,403,'Este perfil no está disponible');
    const [[user]]=await pool.query('SELECT id,name,avatar_url,preferred_location,primary_position,secondary_position,dominant_foot FROM users WHERE id=?',[otherId]); if (!user) return fail(res,404,'Usuario no encontrado');
    const friendship=await getFriendshipStatus(pool,req.user.id,otherId);
    const [[stats]]=await pool.query(
      `SELECT COALESCE(SUM(goals),0) goals,COALESCE(SUM(assists),0) assists,
              COALESCE(SUM(result='win'),0) wins
       FROM match_player_stats WHERE user_id=?`,[otherId]
    );
    const [[privacy]]=await pool.query('SELECT show_upcoming_to_friends,show_stats_to_friends FROM user_social_privacy WHERE user_id=?',[otherId]);
    const canSeeStats=friendship.status==='friends'&&Number(privacy?.show_stats_to_friends??1)===1;
    const response={ok:true,user,friendship,stats:canSeeStats?{goals:Number(stats.goals),assists:Number(stats.assists),wins:Number(stats.wins)}:null,stats_private:!canSeeStats,reputation:publicReputation(await getPlayerReputation(pool,otherId))};
    if (friendship.status==='friends') {
      const [[myStats]]=await pool.query(
        `SELECT COALESCE(SUM(goals),0) goals,COALESCE(SUM(assists),0) assists,
                COALESCE(SUM(result='win'),0) wins
         FROM match_player_stats WHERE user_id=?`,[req.user.id]
      );
      const [[friendshipRow]]=await pool.query('SELECT created_at FROM friendships WHERE id=? AND status=\'accepted\' LIMIT 1',[friendship.friendship_id]);
      const [upcomingMatches]=Number(privacy?.show_upcoming_to_friends??1)===1?await pool.query(
        `SELECT DISTINCT m.id match_id,m.title,m.starts_at,m.capacity,m.spots_taken,i.ticket_type,
                GREATEST(m.capacity-m.spots_taken,0) spots_remaining
         FROM inscriptions i JOIN matches m ON m.id=i.match_id
         WHERE i.user_id=? AND i.status IN ('pending','confirmed')
           AND m.starts_at>NOW() AND m.status<>'cancelled'
         ORDER BY m.starts_at ASC LIMIT 5`,[otherId]
      ):[[]];
      response.my_stats={goals:Number(myStats.goals),assists:Number(myStats.assists),wins:Number(myStats.wins)};
      response.together=await getPairStats(pool,req.user.id,otherId,friendshipRow?.created_at || null);
      response.upcoming_matches=upcomingMatches.map((match)=>({...match,spots_remaining:Number(match.spots_remaining)}));
    }
    res.json(response);
  } catch(error) { console.error('[SOCIAL pair stats]',error); fail(res,500,'No se pudieron calcular las estadísticas'); }
});

router.get('/best-teammates', async (req,res) => {
  try { res.json({ok:true,items:await getBestTeammates(pool,req.user.id,Math.min(Number(req.query.limit)||10,30))}); }
  catch(error) { console.error('[SOCIAL teammates]',error); fail(res,500,'No se pudieron calcular tus mejores compañeros'); }
});
router.get('/frequent-players', async (req,res) => {
  try { res.json({ok:true,items:await getFrequentPlayers(pool,req.user.id,Math.min(Number(req.query.limit)||20,50))}); }
  catch(error) { console.error('[SOCIAL frequent]',error); fail(res,500,'No se pudieron cargar jugadores frecuentes'); }
});

router.get('/groups', async (req,res) => {
  try {
    const [rows]=await pool.query(`SELECT g.id,g.name,g.image_url,g.owner_id,gm.role,COUNT(allm.id) members_count
      FROM friend_group_members gm JOIN friend_groups g ON g.id=gm.group_id LEFT JOIN friend_group_members allm ON allm.group_id=g.id
      WHERE gm.user_id=? GROUP BY g.id,g.name,g.image_url,g.owner_id,gm.role ORDER BY g.updated_at DESC`,[req.user.id]);
    res.json({ok:true,items:rows});
  } catch(error) { console.error('[SOCIAL groups]',error); fail(res,500,'No se pudieron cargar los grupos'); }
});
router.post('/groups', async (req,res) => {
  const name=String(req.body?.name||'').trim().slice(0,80); if (name.length<2) return fail(res,400,'El nombre debe tener al menos 2 caracteres');
  const conn=await pool.getConnection(); try { await conn.beginTransaction(); const [r]=await conn.query('INSERT INTO friend_groups(name,image_url,owner_id) VALUES (?,?,?)',[name,req.body?.image_url||null,req.user.id]); await conn.query(`INSERT INTO friend_group_members(group_id,user_id,role) VALUES (?,?,'owner')`,[r.insertId,req.user.id]); await conn.commit(); res.status(201).json({ok:true,id:r.insertId}); } catch(error) { await conn.rollback(); console.error('[SOCIAL create group]',error); fail(res,500,'No se pudo crear el grupo'); } finally { conn.release(); }
});
router.get('/groups/:id', async (req,res) => {
  try {
    const id=positiveId(req.params.id); const [[membership]]=await pool.query(`SELECT role FROM friend_group_members WHERE group_id=? AND user_id=?`,[id,req.user.id]); if (!membership) return fail(res,403,'No perteneces a este grupo');
    const [[group]]=await pool.query('SELECT id,name,image_url,owner_id,created_at FROM friend_groups WHERE id=?',[id]);
    const [members]=await pool.query(`SELECT gm.user_id id,gm.role,gm.joined_at,u.name,u.avatar_url,u.preferred_location FROM friend_group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY FIELD(gm.role,'owner','admin','member'),u.name`,[id]);
    const [[stats]]=await pool.query(
      `SELECT COUNT(DISTINCT mps.match_id) matches_played,COALESCE(SUM(mps.goals),0) goals,
              COALESCE(SUM(mps.assists),0) assists,COALESCE(SUM(mps.result='win'),0) wins
       FROM friend_group_members gm LEFT JOIN match_player_stats mps ON mps.user_id=gm.user_id
       WHERE gm.group_id=?`,[id]
    );
    const [recentMatches]=await pool.query(
      `SELECT m.id match_id,m.title,m.starts_at,COUNT(DISTINCT mps.user_id) members_played,
              COALESCE(SUM(mps.goals),0) goals,COALESCE(SUM(mps.assists),0) assists
       FROM friend_group_members gm JOIN match_player_stats mps ON mps.user_id=gm.user_id
       JOIN matches m ON m.id=mps.match_id WHERE gm.group_id=? AND m.starts_at<NOW()
       GROUP BY m.id,m.title,m.starts_at HAVING COUNT(DISTINCT mps.user_id)>=2
       ORDER BY m.starts_at DESC LIMIT 5`,[id]
    );
    res.json({
      ok:true,group:{...group,role:membership.role},members,
      stats:{matches_played:Number(stats.matches_played),goals:Number(stats.goals),assists:Number(stats.assists),wins:Number(stats.wins)},
      recent_matches:recentMatches.map((match)=>({...match,members_played:Number(match.members_played),goals:Number(match.goals),assists:Number(match.assists)})),
    });
  } catch(error) { console.error('[SOCIAL group]',error); fail(res,500,'No se pudo cargar el grupo'); }
});
router.patch('/groups/:id', async (req,res) => {
  try { const name=String(req.body?.name||'').trim().slice(0,80); if(name.length<2)return fail(res,400,'Nombre no válido'); const [r]=await pool.query(`UPDATE friend_groups g JOIN friend_group_members gm ON gm.group_id=g.id SET g.name=?,g.image_url=? WHERE g.id=? AND gm.user_id=? AND gm.role IN ('owner','admin')`,[name,req.body?.image_url||null,positiveId(req.params.id),req.user.id]); if(!r.affectedRows)return fail(res,403,'No puedes editar este grupo'); res.json({ok:true}); } catch(error){console.error('[SOCIAL edit group]',error);fail(res,500,'No se pudo editar el grupo');}
});
router.delete('/groups/:id', async (req,res) => {
  try { const [r]=await pool.query('DELETE FROM friend_groups WHERE id=? AND owner_id=?',[positiveId(req.params.id),req.user.id]); if(!r.affectedRows)return fail(res,403,'Solo el propietario puede eliminar el grupo'); res.json({ok:true}); } catch(error){console.error('[SOCIAL delete group]',error);fail(res,500,'No se pudo eliminar el grupo');}
});
router.post('/groups/:id/members', async (req,res) => {
  const memberId=positiveId(req.body?.user_id),groupId=positiveId(req.params.id); if(!memberId)return fail(res,400,'Usuario no válido');
  try { const [[admin]]=await pool.query(`SELECT role FROM friend_group_members WHERE group_id=? AND user_id=? AND role IN ('owner','admin')`,[groupId,req.user.id]); if(!admin)return fail(res,403,'No puedes añadir miembros'); if(!await areFriends(pool,req.user.id,memberId))return fail(res,403,'Solo puedes añadir amigos'); await pool.query(`INSERT IGNORE INTO friend_group_members(group_id,user_id) VALUES (?,?)`,[groupId,memberId]); res.status(201).json({ok:true}); } catch(error){console.error('[SOCIAL add member]',error);fail(res,500,'No se pudo añadir al grupo');}
});
router.delete('/groups/:id/members/:userId', async (req,res) => {
  try { const groupId=positiveId(req.params.id),memberId=positiveId(req.params.userId); const [[admin]]=await pool.query(`SELECT role FROM friend_group_members WHERE group_id=? AND user_id=? AND role IN ('owner','admin')`,[groupId,req.user.id]); if(!admin)return fail(res,403,'No puedes quitar miembros'); const [r]=await pool.query(`DELETE FROM friend_group_members WHERE group_id=? AND user_id=? AND role<>'owner'`,[groupId,memberId]); if(!r.affectedRows)return fail(res,404,'Miembro no encontrado'); res.json({ok:true}); } catch(error){console.error('[SOCIAL remove member]',error);fail(res,500,'No se pudo quitar al miembro');}
});
router.post('/groups/:id/leave', async (req,res) => {
  try { const [r]=await pool.query(`DELETE FROM friend_group_members WHERE group_id=? AND user_id=? AND role<>'owner'`,[positiveId(req.params.id),req.user.id]); if(!r.affectedRows)return fail(res,403,'El propietario debe eliminar el grupo o transferirlo'); res.json({ok:true}); } catch(error){console.error('[SOCIAL leave group]',error);fail(res,500,'No se pudo salir del grupo');}
});

router.get('/matches/:matchId/friends', async (req,res) => {
  try { const [rows]=await pool.query(`SELECT u.id,u.name,u.avatar_url,i.ticket_type FROM friendships f JOIN users u ON u.id=IF(f.requester_id=?,f.addressee_id,f.requester_id) JOIN inscriptions i ON i.user_id=u.id AND i.match_id=? AND i.status IN ('pending','confirmed') WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?) ORDER BY u.name`,[req.user.id,positiveId(req.params.matchId),req.user.id,req.user.id]); res.json({ok:true,items:rows}); } catch(error){console.error('[SOCIAL match friends]',error);fail(res,500,'No se pudieron cargar los amigos del partido');}
});
router.post('/matches/:matchId/invitations', async (req,res) => {
  const matchId=positiveId(req.params.matchId),ids=[...new Set((req.body?.user_ids||[]).map(positiveId).filter(Boolean))].filter(id=>id!==Number(req.user.id)); if(!matchId||!ids.length)return fail(res,400,'Selecciona al menos un amigo'); if(ids.length>30)return fail(res,400,'Máximo 30 invitaciones por envío');
  const conn=await pool.getConnection(); try { await conn.beginTransaction(); const [[match]]=await conn.query(`SELECT id,title,starts_at,status,capacity,spots_taken FROM matches WHERE id=? FOR UPDATE`,[matchId]); if(!match||match.status==='cancelled'||new Date(match.starts_at)<=new Date()||match.spots_taken>=match.capacity){await conn.rollback();return fail(res,409,'El partido ya no admite invitaciones');} const [[sender]]=await conn.query('SELECT name FROM users WHERE id=?',[req.user.id]); let sent=0,already_registered=0,not_friends=0; for(const receiverId of ids){ if(!await areFriends(conn,req.user.id,receiverId)){not_friends++;continue;} const [[enrolled]]=await conn.query(`SELECT id FROM inscriptions WHERE match_id=? AND user_id=? AND status IN ('pending','confirmed') LIMIT 1`,[matchId,receiverId]); if(enrolled){already_registered++;continue;} const [r]=await conn.query(`INSERT INTO match_invitations(match_id,sender_id,receiver_id,group_id,status) VALUES (?,?,?,?, 'pending') ON DUPLICATE KEY UPDATE status=IF(status IN ('declined','expired'),'pending',status),updated_at=NOW()`,[matchId,req.user.id,receiverId,positiveId(req.body?.group_id)]); const [[invite]]=await conn.query(`SELECT id FROM match_invitations WHERE match_id=? AND sender_id=? AND receiver_id=?`,[matchId,req.user.id,receiverId]); await createSocialNotification(conn,{userId:receiverId,actorId:req.user.id,type:req.body?.group_id?'group_invitation':'match_invitation',entityType:'match',entityId:matchId,title:'Te invitan a jugar',body:`${sender.name} te invita a ${match.title}`,data:{screen:'Match',matchId,invitationId:invite.id},dedupeKey:`match-invite:${invite.id}:${r.changedRows||r.affectedRows}:${Date.now()}`}); sent++; } await conn.commit(); res.status(201).json({ok:true,sent,already_registered,not_friends}); } catch(error){await conn.rollback();console.error('[SOCIAL invite]',error);fail(res,500,'No se pudieron enviar las invitaciones');} finally{conn.release();}
});
router.get('/matches/:matchId/invitations', async (req,res) => {
  try { const [rows]=await pool.query(`SELECT mi.id,mi.receiver_id,mi.status,mi.created_at,u.name,u.avatar_url FROM match_invitations mi JOIN users u ON u.id=mi.receiver_id WHERE mi.match_id=? AND mi.sender_id=? ORDER BY mi.created_at DESC`,[positiveId(req.params.matchId),req.user.id]); res.json({ok:true,items:rows}); } catch(error){console.error('[SOCIAL sent invitations]',error);fail(res,500,'No se pudieron cargar las invitaciones enviadas');}
});
router.post('/groups/:id/invite-match/:matchId', async (req,res) => {
  const groupId=positiveId(req.params.id),matchId=positiveId(req.params.matchId);
  try {
    const [[member]]=await pool.query(`SELECT role FROM friend_group_members WHERE group_id=? AND user_id=?`,[groupId,req.user.id]);
    if(!member)return fail(res,403,'No perteneces a este grupo');
    const [[match]]=await pool.query(`SELECT id FROM matches WHERE id=? AND starts_at>NOW() AND status<>'cancelled' AND spots_taken<capacity`,[matchId]);
    if(!match)return fail(res,409,'El partido ya no admite invitaciones');
    const [result]=await pool.query(
      `INSERT INTO match_invitations(match_id,sender_id,receiver_id,group_id,status)
       SELECT ?,?,gm.user_id,?,'pending' FROM friend_group_members gm
       JOIN friendships f ON f.user_low_id=LEAST(?,gm.user_id) AND f.user_high_id=GREATEST(?,gm.user_id) AND f.status='accepted'
       LEFT JOIN inscriptions i ON i.match_id=? AND i.user_id=gm.user_id AND i.status IN ('pending','confirmed')
       WHERE gm.group_id=? AND gm.user_id<>? AND i.id IS NULL
       ON DUPLICATE KEY UPDATE status=IF(status IN ('declined','expired'),'pending',status),updated_at=NOW()`,
      [matchId,req.user.id,groupId,req.user.id,req.user.id,matchId,groupId,req.user.id]
    );
    res.status(201).json({ok:true,sent:result.affectedRows});
  } catch(error){console.error('[SOCIAL group invite]',error);fail(res,500,'No se pudo invitar al grupo');}
});
router.get('/match-invitations', async (req,res) => {
  try { await expireMatchInvitations(pool,req.user.id); const [rows]=await pool.query(`SELECT mi.id,mi.status,mi.created_at,m.id match_id,m.title,m.starts_at,m.capacity,m.spots_taken,u.id sender_id,u.name sender_name,u.avatar_url sender_avatar FROM match_invitations mi JOIN matches m ON m.id=mi.match_id JOIN users u ON u.id=mi.sender_id WHERE mi.receiver_id=? ORDER BY FIELD(mi.status,'pending','viewed','accepted','declined','expired'),mi.created_at DESC LIMIT 100`,[req.user.id]); res.json({ok:true,items:rows}); } catch(error){console.error('[SOCIAL invitations]',error);fail(res,500,'No se pudieron cargar las invitaciones');}
});
router.patch('/match-invitations/:id/:action(view|decline)', async (req,res) => {
  try { const status=req.params.action==='view'?'viewed':'declined'; const [r]=await pool.query(`UPDATE match_invitations SET status=? WHERE id=? AND receiver_id=? AND status IN ('pending','viewed')`,[status,positiveId(req.params.id),req.user.id]); if(!r.affectedRows)return fail(res,404,'Invitación no encontrada'); res.json({ok:true,status}); } catch(error){console.error('[SOCIAL invitation action]',error);fail(res,500,'No se pudo actualizar la invitación');}
});

router.get('/notifications', async (req,res) => {
  try { const [rows]=await pool.query(`SELECT n.*,u.name actor_name,u.avatar_url actor_avatar FROM social_notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 100`,[req.user.id]); const [[count]]=await pool.query('SELECT COUNT(*) unread_count FROM social_notifications WHERE user_id=? AND read_at IS NULL',[req.user.id]); res.json({ok:true,unread_count:Number(count.unread_count),items:rows.map(r=>({...r,data:typeof r.data==='string'?JSON.parse(r.data):r.data}))}); } catch(error){console.error('[SOCIAL notifications]',error);fail(res,500,'No se pudieron cargar las notificaciones');}
});
router.patch('/notifications/:id/read', async (req,res) => { try { await pool.query('UPDATE social_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND user_id=?',[positiveId(req.params.id),req.user.id]); res.json({ok:true}); } catch(error){fail(res,500,'No se pudo marcar como leída');} });
router.patch('/notifications/read-all', async (req,res) => { try { const [result]=await pool.query('UPDATE social_notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL',[req.user.id]); res.json({ok:true,updated:result.affectedRows}); } catch(error){fail(res,500,'No se pudieron marcar como leídas');} });

router.get('/notification-preferences', async (req,res) => {
  try { await pool.query('INSERT IGNORE INTO user_notification_preferences(user_id) VALUES (?)',[req.user.id]); const [[row]]=await pool.query('SELECT social_enabled,match_updates_enabled,match_reminders_enabled,easypass_enabled,news_enabled FROM user_notification_preferences WHERE user_id=?',[req.user.id]); res.json({ok:true,preferences:Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Boolean(value)]))}); }
  catch(error){console.error('[NOTIFICATION preferences]',error);fail(res,500,'No se pudieron cargar las preferencias');}
});
router.patch('/notification-preferences', async (req,res) => {
  const keys=['social_enabled','match_updates_enabled','match_reminders_enabled','easypass_enabled','news_enabled'];
  const values=keys.map((key)=>req.body?.[key] ? 1 : 0);
  try { await pool.query(`INSERT INTO user_notification_preferences(user_id,${keys.join(',')}) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ${keys.map((key)=>`${key}=VALUES(${key})`).join(',')}`,[req.user.id,...values]); res.json({ok:true}); }
  catch(error){console.error('[NOTIFICATION preferences update]',error);fail(res,500,'No se pudieron guardar las preferencias');}
});

export default router;

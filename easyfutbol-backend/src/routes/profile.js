import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import bcrypt from 'bcrypt';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Expo } from 'expo-server-sdk';
import { getUserEntitlements } from '../services/subscriptionService.js';
import { getPlayerReputation } from '../services/playerReputationService.js';
import { getBestTeammates } from '../services/socialStatsService.js';
import { validatePublicName } from '../services/publicNameModerationService.js';

const router = Router();
const expo = new Expo();

// carpeta de uploads
const uploadDir = path.join(process.cwd(), 'uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Nombre único para evitar caché en la app (y en CDNs/navegadores)
    cb(null, `user-${req.user.id}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

/**
 * Perfil + stats
 */
router.get('/me/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [[user]] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at, u.avatar_url, u.push_token, u.easypass_balance,
              u.primary_position,u.secondary_position,u.dominant_foot,
              EXISTS(
                SELECT 1 FROM user_plus_subscriptions ups
                WHERE ups.user_id = u.id
                  AND ups.status IN ('active', 'trialing')
                  AND (ups.current_period_end IS NULL OR ups.current_period_end > NOW())
              ) AS is_plus
       FROM users u WHERE u.id=? LIMIT 1`,
      [userId]
    );
    if (!user) return res.status(404).json({ ok:false, msg:'Usuario no encontrado' });
    let subscription = null;
    try { subscription = await getUserEntitlements(pool, userId); }
    catch (subscriptionError) { console.warn('[GET /me/profile] Suscripción no disponible:', subscriptionError?.message || subscriptionError); }

    const [[stats]] = await pool.query(
      `SELECT
         COUNT(DISTINCT mps.match_id) AS matches_played,
         COALESCE(SUM(mps.goals), 0) AS goals,
         COALESCE(SUM(mps.assists), 0) AS assists,
         COALESCE(SUM(mps.is_mvp), 0) AS mvps,
         COALESCE(SUM(mps.goals + mps.assists), 0) AS total,
         COALESCE(SUM(CASE WHEN mps.result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
         COALESCE(SUM(CASE WHEN mps.result = 'loss' THEN 1 ELSE 0 END), 0) AS losses,
         COALESCE(SUM(CASE WHEN mps.result = 'draw' THEN 1 ELSE 0 END), 0) AS draws,
         COUNT(DISTINCT CASE WHEN mps.result IS NOT NULL THEN mps.match_id END) AS matches_with_result
       FROM match_player_stats mps
       WHERE mps.user_id=?`,
      [userId]
    );

    let easyPassBalances = [];
    try {
      const [balanceRows] = await pool.query(
        `SELECT
           l.id AS location_id,
           l.name AS location_name,
           l.slug AS location_slug,
           COALESCE(ueb.balance, 0) AS balance
         FROM locations l
         LEFT JOIN user_easypass_balances ueb
           ON ueb.location_id = l.id
          AND ueb.user_id = ?
         WHERE l.active = 1
         ORDER BY l.id ASC`,
        [userId]
      );

      easyPassBalances = balanceRows.map((row) => ({
        location_id: Number(row.location_id),
        locationId: Number(row.location_id),
        location_name: row.location_name,
        locationName: row.location_name,
        location_slug: row.location_slug,
        locationSlug: row.location_slug,
        balance: Number(row.balance || 0),
        easyPassBalance: Number(row.balance || 0),
        credits: Number(row.balance || 0),
      }));
    } catch (balanceError) {
      console.warn('[GET /me/profile] No se pudieron cargar balances por sede:', balanceError?.message || balanceError);
      easyPassBalances = [
        {
          location_id: 1,
          locationId: 1,
          location_name: 'Valladolid',
          locationName: 'Valladolid',
          location_slug: 'valladolid',
          locationSlug: 'valladolid',
          balance: Number(user.easypass_balance || 0),
          easyPassBalance: Number(user.easypass_balance || 0),
          credits: Number(user.easypass_balance || 0),
        },
      ];
    }

    res.json({
      ok: true,
      data: {
        user: {
          ...user,
          is_plus: Boolean(user.is_plus || subscription?.subscription_active),
          isPlus: Boolean(user.is_plus || subscription?.subscription_active),
          subscription_plan: subscription?.plan || (user.is_plus ? 'plus' : null),
          has_golden_name: Boolean(user.is_plus || subscription?.subscription_active),
          easyPassBalance: Number(user.easypass_balance || 0),
          credits: Number(user.easypass_balance || 0),
          easyPassBalances,
          easypass_balances: easyPassBalances,
        },
        stats: {
          matches_played: Number(stats.matches_played || 0),
          matches_with_result: Number(stats.matches_with_result || 0),
          wins: Number(stats.wins || 0),
          losses: Number(stats.losses || 0),
          draws: Number(stats.draws || 0),
          win_rate: Number(stats.matches_with_result || 0) > 0
            ? Math.round((Number(stats.wins || 0) / Number(stats.matches_with_result || 0)) * 100)
            : 0,
          goals: Number(stats.goals || 0),
          assists: Number(stats.assists || 0),
          mvps: Number(stats.mvps || 0),
          total: Number(stats.total || 0)
        }
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error obteniendo perfil' });
  }
});

/**
 * Saldo de EasyPass del usuario autenticado
 */
router.get('/me/credits', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [[user]] = await pool.query(
      'SELECT easypass_balance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ ok:false, msg:'Usuario no encontrado' });
    }

    let easyPassBalances = [];
    try {
      const [balanceRows] = await pool.query(
        `SELECT
           l.id AS location_id,
           l.name AS location_name,
           l.slug AS location_slug,
           COALESCE(ueb.balance, 0) AS balance
         FROM locations l
         LEFT JOIN user_easypass_balances ueb
           ON ueb.location_id = l.id
          AND ueb.user_id = ?
         WHERE l.active = 1
         ORDER BY l.id ASC`,
        [userId]
      );

      easyPassBalances = balanceRows.map((row) => ({
        location_id: Number(row.location_id),
        locationId: Number(row.location_id),
        location_name: row.location_name,
        locationName: row.location_name,
        location_slug: row.location_slug,
        locationSlug: row.location_slug,
        balance: Number(row.balance || 0),
        easyPassBalance: Number(row.balance || 0),
        credits: Number(row.balance || 0),
      }));
    } catch (balanceError) {
      console.warn('[GET /me/credits] No se pudieron cargar balances por sede:', balanceError?.message || balanceError);
      easyPassBalances = [
        {
          location_id: 1,
          locationId: 1,
          location_name: 'Valladolid',
          locationName: 'Valladolid',
          location_slug: 'valladolid',
          locationSlug: 'valladolid',
          balance: Number(user.easypass_balance || 0),
          easyPassBalance: Number(user.easypass_balance || 0),
          credits: Number(user.easypass_balance || 0),
        },
      ];
    }

    return res.json({
      ok: true,
      easyPassBalance: Number(user.easypass_balance || 0),
      credits: Number(user.easypass_balance || 0),
      easyPassBalances,
      easypass_balances: easyPassBalances,
    });
  } catch (e) {
    console.error('[GET /me/credits]', e);
    return res.status(500).json({ ok:false, msg:'Error obteniendo EasyPass' });
  }
});

/**
 * Actualizar perfil
 */
router.patch('/me/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, password } = req.body || {};

    if (!name && !email && !password) {
      return res.status(400).json({ ok:false, msg:'Nada que actualizar' });
    }

    const fields = [];
    const values = [];

    if (name) {
      const nameValidation = validatePublicName(name);
      if (!nameValidation.ok) return res.status(422).json(nameValidation);
      const [[nameOwner]] = await pool.query(
        'SELECT id FROM users WHERE LOWER(TRIM(name))=LOWER(?) AND id<>? LIMIT 1',
        [nameValidation.name, userId]
      );
      if (nameOwner) {
        return res.status(409).json({ ok:false, code:'USERNAME_TAKEN', msg:'Este nombre de usuario ya está en uso' });
      }
      fields.push('name=?');
      values.push(nameValidation.name);
    }
    if (email) {
      fields.push('email=?');
      values.push(email);
    }
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      fields.push('password=?');
      values.push(hashed);
    }
    values.push(userId);

    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);

    res.json({ ok:true, msg:'Perfil actualizado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error actualizando perfil' });
  }
});

const preferenceOptions = {
  days:new Set([0,1,2,3,4,5,6]),
  slots:new Set(['morning','afternoon','evening']),
  positions:new Set(['goalkeeper','defender','midfielder','forward']),
};
const cleanArray = (value, allowed, max=10) => [...new Set((Array.isArray(value) ? value : []).filter((item) => allowed.has(item)))].slice(0,max);

router.get('/me/match-preferences', requireAuth, async (req,res) => {
  try {
    const [[row]]=await pool.query('SELECT available_days,time_slots,location_ids,positions,recommendations_enabled,updated_at FROM user_match_preferences WHERE user_id=?',[req.user.id]);
    res.json({ok:true,data:row ? {
      available_days:row.available_days || [],time_slots:row.time_slots || [],location_ids:(row.location_ids || []).map(Number),positions:row.positions || [],
      recommendations_enabled:Boolean(row.recommendations_enabled),updated_at:row.updated_at,
    } : {available_days:[],time_slots:[],location_ids:[],positions:[],recommendations_enabled:true}});
  } catch(error) { console.error('[MATCH PREFERENCES GET]',error); res.status(500).json({ok:false,msg:'No se pudieron cargar tus preferencias'}); }
});

router.put('/me/match-preferences', requireAuth, async (req,res) => {
  try {
    const days=cleanArray((req.body?.available_days || []).map(Number),preferenceOptions.days,7);
    const slots=cleanArray(req.body?.time_slots,preferenceOptions.slots,3);
    const positions=cleanArray(req.body?.positions,preferenceOptions.positions,4);
    const locationIds=[...new Set((req.body?.location_ids || []).map(Number).filter((id)=>Number.isInteger(id)&&id>0))].slice(0,10);
    const enabled=req.body?.recommendations_enabled !== false;
    await pool.query(
      `INSERT INTO user_match_preferences(user_id,available_days,time_slots,location_ids,positions,recommendations_enabled)
       VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE available_days=VALUES(available_days),time_slots=VALUES(time_slots),
       location_ids=VALUES(location_ids),positions=VALUES(positions),recommendations_enabled=VALUES(recommendations_enabled)`,
      [req.user.id,JSON.stringify(days),JSON.stringify(slots),JSON.stringify(locationIds),JSON.stringify(positions),enabled?1:0]
    );
    res.json({ok:true,msg:'Preferencias guardadas'});
  } catch(error) { console.error('[MATCH PREFERENCES PUT]',error); res.status(500).json({ok:false,msg:'No se pudieron guardar tus preferencias'}); }
});

router.get('/me/match-recommendations', requireAuth, async (req,res) => {
  try {
    const [[preferences]]=await pool.query('SELECT available_days,time_slots,location_ids,positions,recommendations_enabled FROM user_match_preferences WHERE user_id=?',[req.user.id]);
    const hasCriteria=Boolean(preferences && (
      (preferences.available_days || []).length ||
      (preferences.time_slots || []).length ||
      (preferences.location_ids || []).length
    ));
    if (!preferences || !Number(preferences.recommendations_enabled)) return res.json({ok:true,data:[],configured:hasCriteria});
    const [matches]=await pool.query(
      `SELECT m.id,m.title,m.starts_at,m.capacity,m.spots_taken,m.city,
              COALESCE(m.location_id,CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) location_id,
              COALESCE(l.name,m.city) location_name,f.name field_name,WEEKDAY(m.starts_at) weekday,HOUR(m.starts_at) start_hour,
              GREATEST(m.capacity-m.spots_taken,0) spots_remaining
       FROM matches m JOIN fields f ON f.id=m.field_id LEFT JOIN locations l ON l.id=m.location_id
       WHERE m.starts_at>NOW() AND m.status IN ('scheduled','open') AND m.spots_taken<m.capacity
         AND NOT EXISTS (SELECT 1 FROM inscriptions i WHERE i.match_id=m.id AND i.user_id=? AND i.status IN ('pending','confirmed'))
       ORDER BY m.starts_at ASC LIMIT 100`,[req.user.id]
    );
    const days=(preferences.available_days || []).map(Number),locations=(preferences.location_ids || []).map(Number),slots=preferences.time_slots || [];
    const slotForHour=(hour)=>hour<13?'morning':hour<19?'afternoon':'evening';
    const recommendations=matches.map((match)=>{
      const reasons=[]; let score=0;
      if (!days.length || days.includes(Number(match.weekday))) { score+=35; reasons.push('Día disponible'); } else return null;
      if (!slots.length || slots.includes(slotForHour(Number(match.start_hour)))) { score+=30; reasons.push('Horario preferido'); } else return null;
      if (!locations.length || locations.includes(Number(match.location_id))) { score+=30; reasons.push('Sede favorita'); } else return null;
      if (Number(match.spots_remaining)<=3) { score+=5; reasons.push(`Quedan ${match.spots_remaining} plazas`); }
      return {...match,location_id:Number(match.location_id),spots_remaining:Number(match.spots_remaining),score,reasons};
    }).filter(Boolean).sort((a,b)=>b.score-a.score || new Date(a.starts_at)-new Date(b.starts_at)).slice(0,12);
    res.json({ok:true,data:recommendations,configured:hasCriteria,positions:preferences.positions || []});
  } catch(error) { console.error('[MATCH RECOMMENDATIONS]',error); res.status(500).json({ok:false,msg:'No se pudieron calcular tus recomendaciones'}); }
});

router.get('/me/reputation', requireAuth, async (req,res) => {
  try { res.json({ok:true,data:await getPlayerReputation(pool,req.user.id)}); }
  catch(error) { console.error('[PLAYER REPUTATION]',error); res.status(500).json({ok:false,msg:'No se pudo calcular tu fiabilidad'}); }
});

const sportPositions=new Set(['goalkeeper','defender','midfielder','forward']);
const dominantFeet=new Set(['right','left','both']);
router.get('/me/sport-profile', requireAuth, async (req,res) => {
  try {
    const [[user]]=await pool.query('SELECT primary_position,secondary_position,dominant_foot FROM users WHERE id=?',[req.user.id]);
    const [byLocation]=await pool.query(
      `SELECT COALESCE(l.name,m.city,'EasyFutbol') location_name,COUNT(DISTINCT mps.match_id) matches_played,
              COALESCE(SUM(mps.goals),0) goals,COALESCE(SUM(mps.assists),0) assists,COALESCE(SUM(mps.result='win'),0) wins
       FROM match_player_stats mps JOIN matches m ON m.id=mps.match_id LEFT JOIN locations l ON l.id=m.location_id
       WHERE mps.user_id=? GROUP BY COALESCE(l.name,m.city,'EasyFutbol') ORDER BY matches_played DESC`,[req.user.id]
    );
    const [monthly]=await pool.query(
      `SELECT DATE_FORMAT(m.starts_at,'%Y-%m') month,COUNT(DISTINCT mps.match_id) matches_played,
              COALESCE(SUM(mps.goals),0) goals,COALESCE(SUM(mps.assists),0) assists,COALESCE(SUM(mps.result='win'),0) wins
       FROM match_player_stats mps JOIN matches m ON m.id=mps.match_id
       WHERE mps.user_id=? AND m.starts_at>=DATE_SUB(CURRENT_DATE,INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(m.starts_at,'%Y-%m') ORDER BY month ASC`,[req.user.id]
    );
    const [recent]=await pool.query(
      `SELECT mps.result,m.starts_at FROM match_player_stats mps JOIN matches m ON m.id=mps.match_id
       WHERE mps.user_id=? AND mps.result IN ('win','draw','loss') ORDER BY m.starts_at DESC LIMIT 20`,[req.user.id]
    );
    let currentStreak=0; const latest=recent[0]?.result || null;
    for(const row of recent){if(row.result!==latest)break;currentStreak+=1;}
    const teammates=await getBestTeammates(pool,req.user.id,3);
    res.json({ok:true,data:{
      profile:user,by_location:byLocation.map(row=>({...row,matches_played:Number(row.matches_played),goals:Number(row.goals),assists:Number(row.assists),wins:Number(row.wins)})),
      monthly:monthly.map(row=>({...row,matches_played:Number(row.matches_played),goals:Number(row.goals),assists:Number(row.assists),wins:Number(row.wins)})),
      streak:{result:latest,count:currentStreak},best_teammates:teammates,
    }});
  } catch(error) { console.error('[SPORT PROFILE GET]',error); res.status(500).json({ok:false,msg:'No se pudo cargar tu perfil deportivo'}); }
});
router.patch('/me/sport-profile', requireAuth, async (req,res) => {
  try {
    const primary=req.body?.primary_position || null,secondary=req.body?.secondary_position || null,foot=req.body?.dominant_foot || null;
    if(primary&&!sportPositions.has(primary))return res.status(400).json({ok:false,msg:'Posición principal no válida'});
    if(secondary&&!sportPositions.has(secondary))return res.status(400).json({ok:false,msg:'Posición secundaria no válida'});
    if(foot&&!dominantFeet.has(foot))return res.status(400).json({ok:false,msg:'Pierna dominante no válida'});
    if(primary&&secondary&&primary===secondary)return res.status(400).json({ok:false,msg:'Elige dos posiciones diferentes'});
    await pool.query('UPDATE users SET primary_position=?,secondary_position=?,dominant_foot=? WHERE id=?',[primary,secondary,foot,req.user.id]);
    res.json({ok:true,msg:'Perfil deportivo actualizado'});
  } catch(error) { console.error('[SPORT PROFILE PATCH]',error); res.status(500).json({ok:false,msg:'No se pudo actualizar tu perfil deportivo'}); }
});

/**
 * Subir foto de perfil
 */
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user.id;

    // Leer avatar anterior para borrarlo si era local
    const [[prev]] = await pool.query('SELECT avatar_url FROM users WHERE id=? LIMIT 1', [userId]);

    const fileUrl = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url=? WHERE id=?', [fileUrl, userId]);

    // Borrar avatar anterior (si era un archivo local) para no acumular basura
    try {
      const prevUrl = prev?.avatar_url || '';
      if (prevUrl && prevUrl.startsWith('/uploads/avatars/')) {
        const prevFilename = prevUrl.replace('/uploads/avatars/', '').split('?')[0];
        const prevPath = path.join(process.cwd(), 'uploads/avatars', prevFilename);
        if (fs.existsSync(prevPath)) {
          fs.unlinkSync(prevPath);
        }
      }
    } catch (e) {
      console.warn('[POST /me/avatar] No se pudo borrar avatar anterior:', e?.message || e);
    }

    res.json({ ok:true, avatar_url: fileUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error subiendo avatar' });
  }
});

/**
 * Guardar token push
 */

router.post('/me/push-token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ ok:false, msg:'Token inválido' });
    }
    await pool.query('UPDATE users SET push_token=? WHERE id=?', [token, req.user.id]);
    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error guardando push token' });
  }
});

/**
 * Eliminar cuenta (irreversible)
 * - Borra inscripciones del usuario
 * - Borra el usuario
 * - Intenta borrar el avatar local si existe
 */
router.delete('/me/profile', requireAuth, async (req, res) => {
  const userId = req.user.id;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Leer avatar_url para intentar borrar el archivo local después
    const [[u]] = await conn.query('SELECT avatar_url FROM users WHERE id=? LIMIT 1', [userId]);

    // Borra dependencias conocidas
    await conn.query('DELETE FROM inscriptions WHERE user_id=?', [userId]);
    await conn.query('DELETE FROM easypass_transactions WHERE user_id=?', [userId]);

    // Finalmente borra el usuario
    const [delRes] = await conn.query('DELETE FROM users WHERE id=?', [userId]);
    await conn.commit();

    if (!delRes.affectedRows) {
      return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
    }

    // Intentar borrar avatar local (si es una ruta bajo /uploads/avatars)
    try {
      const avatarUrl = u?.avatar_url || '';
      if (avatarUrl.startsWith('/uploads/avatars/')) {
        const filename = avatarUrl.replace('/uploads/avatars/', '').split('?')[0];
        const filePath = path.join(process.cwd(), 'uploads/avatars', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      // No bloquea la eliminación de cuenta
      console.warn('[DELETE /me/profile] No se pudo borrar avatar local:', e?.message || e);
    }

    return res.json({ ok: true, msg: 'Cuenta eliminada' });
  } catch (e) {
    try { if (conn) await conn.rollback(); } catch (_) {}
    console.error('[DELETE /me/profile] error', e);

    // Si hay restricciones FK, devolvemos un mensaje más claro
    if (e?.code === 'ER_ROW_IS_REFERENCED_2' || e?.errno === 1451) {
      return res.status(409).json({ ok: false, msg: 'No se puede eliminar la cuenta porque existen datos vinculados (restricciones de base de datos).' });
    }

    return res.status(500).json({ ok: false, msg: 'Error eliminando cuenta' });
  } finally {
    try { if (conn) conn.release(); } catch (_) {}
  }
});

export default router;

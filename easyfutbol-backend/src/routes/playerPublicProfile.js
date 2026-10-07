// Perfil público del jugador: foto de portada, estadísticas que elige
// mostrar, galería de fotos de partidos y comentarios (solo de jugadores con
// al menos 5 partidos jugados, para frenar cuentas falsas). A diferencia de
// /api/social/users/:userId/stats, esto no exige amistad — lo ve cualquiera
// con sesión iniciada, salvo que haya bloqueo entre los dos.
// Montado en /api/player-profile
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { positiveId } from '../services/socialService.js';
import { getPlayerReputation, publicReputation } from '../services/playerReputationService.js';

const router = Router();
router.use(requireAuth);

const MIN_MATCHES_TO_COMMENT = 5;
const VISIBLE_STAT_KEYS = ['goals', 'assists', 'saves', 'mvp_count', 'matches_played', 'win_rate'];

const fail = (res, code, msg) => res.status(code).json({ ok: false, msg });

async function isBlocked(userId, otherId) {
  const [[row]] = await pool.query(
    'SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1',
    [userId, otherId, otherId, userId]
  );
  return Boolean(row);
}

async function getSeasonStats(userId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS matches_played, COALESCE(SUM(goals),0) AS goals, COALESCE(SUM(assists),0) AS assists,
            COALESCE(SUM(saves),0) AS saves, COALESCE(SUM(is_mvp),0) AS mvp_count,
            COALESCE(SUM(result='win'),0) AS wins, COALESCE(SUM(result='loss'),0) AS losses, COALESCE(SUM(result='draw'),0) AS draws
     FROM match_player_stats WHERE user_id=?`,
    [userId]
  );
  const decided = Number(row.wins) + Number(row.losses) + Number(row.draws);
  return {
    matches_played: Number(row.matches_played),
    goals: Number(row.goals),
    assists: Number(row.assists),
    saves: Number(row.saves),
    mvp_count: Number(row.mvp_count),
    win_rate: decided ? Math.round((Number(row.wins) / decided) * 100) : 0,
  };
}

// --- almacenamiento de banners ---
const bannerDir = path.join(process.cwd(), 'uploads/banners');
if (!fs.existsSync(bannerDir)) fs.mkdirSync(bannerDir, { recursive: true });
const BANNER_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const uploadBanner = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, bannerDir),
    filename: (req, file, cb) => cb(null, `user-${req.user.id}-${Date.now()}${BANNER_EXT[file.mimetype] || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (BANNER_EXT[file.mimetype] ? cb(null, true) : cb(new Error('La portada debe ser una imagen (jpg, png o webp)'))),
});

// --- almacenamiento de fotos de perfil/partido ---
const photoDir = path.join(process.cwd(), 'uploads/profile-photos');
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });
const PHOTO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const uploadPhoto = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, photoDir),
    filename: (req, file, cb) => cb(null, `user-${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e6)}${PHOTO_EXT[file.mimetype] || '.jpg'}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (PHOTO_EXT[file.mimetype] ? cb(null, true) : cb(new Error('La foto debe ser una imagen (jpg, png o webp)'))),
});

/** GET /api/player-profile/:userId — perfil público completo */
router.get('/:userId', async (req, res) => {
  const targetId = positiveId(req.params.userId);
  if (!targetId) return fail(res, 400, 'Usuario no válido');

  try {
    if (await isBlocked(req.user.id, targetId)) return fail(res, 403, 'Este perfil no está disponible');

    const [[user]] = await pool.query(
      'SELECT id, name, avatar_url, banner_url, preferred_location, primary_position, dominant_foot FROM users WHERE id=?',
      [targetId]
    );
    if (!user) return fail(res, 404, 'Usuario no encontrado');

    await pool.query('INSERT IGNORE INTO user_social_privacy(user_id) VALUES (?)', [targetId]);
    const [[privacy]] = await pool.query(
      'SELECT visible_stats, comments_enabled FROM user_social_privacy WHERE user_id=?',
      [targetId]
    );
    const visibleStats = String(privacy?.visible_stats || '').split(',').map((s) => s.trim()).filter((s) => VISIBLE_STAT_KEYS.includes(s));
    const commentsEnabled = Boolean(Number(privacy?.comments_enabled ?? 1));

    const isOwner = req.user.id === targetId;
    const seasonStats = await getSeasonStats(targetId);
    const stats = {};
    for (const key of visibleStats) stats[key] = seasonStats[key];

    const [photos] = await pool.query(
      `SELECT p.id, p.image_url, p.caption, p.created_at, p.match_id, m.title AS match_title
       FROM player_profile_photos p LEFT JOIN matches m ON m.id = p.match_id
       WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT 30`,
      [targetId]
    );

    const [comments] = await pool.query(
      `SELECT c.id, c.body, c.created_at, c.author_user_id, u.name AS author_name, u.avatar_url AS author_avatar_url
       FROM player_profile_comments c JOIN users u ON u.id = c.author_user_id
       WHERE c.profile_user_id=? ORDER BY c.created_at DESC LIMIT 50`,
      [targetId]
    );

    let myMatchesPlayed = seasonStats.matches_played;
    if (!isOwner) {
      const [[myRow]] = await pool.query('SELECT COUNT(*) AS c FROM match_player_stats WHERE user_id=?', [req.user.id]);
      myMatchesPlayed = Number(myRow.c);
    }

    res.json({
      ok: true,
      user,
      is_owner: isOwner,
      matches_played: seasonStats.matches_played,
      visible_stats: visibleStats,
      all_stats: isOwner ? seasonStats : undefined,
      stats,
      comments_enabled: commentsEnabled,
      can_comment: !isOwner && commentsEnabled && myMatchesPlayed >= MIN_MATCHES_TO_COMMENT,
      min_matches_to_comment: MIN_MATCHES_TO_COMMENT,
      reputation: publicReputation(await getPlayerReputation(pool, targetId)),
      photos: photos.map((p) => ({
        id: p.id,
        image_url: p.image_url,
        caption: p.caption,
        created_at: p.created_at,
        match_id: p.match_id,
        match_title: p.match_title,
      })),
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        created_at: c.created_at,
        author: { id: c.author_user_id, name: c.author_name, avatar_url: c.author_avatar_url },
        can_delete: isOwner || c.author_user_id === req.user.id,
      })),
    });
  } catch (error) {
    console.error('[GET /player-profile/:userId]', error);
    fail(res, 500, 'No se pudo cargar el perfil');
  }
});

/** PATCH /api/player-profile/me/settings — { visible_stats: string[], comments_enabled: boolean } */
router.patch('/me/settings', async (req, res) => {
  try {
    const rawStats = Array.isArray(req.body?.visible_stats) ? req.body.visible_stats : [];
    const visibleStats = [...new Set(rawStats.map(String))].filter((k) => VISIBLE_STAT_KEYS.includes(k));
    const commentsEnabled = req.body?.comments_enabled ? 1 : 0;

    await pool.query(
      `INSERT INTO user_social_privacy (user_id, visible_stats, comments_enabled)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE visible_stats=VALUES(visible_stats), comments_enabled=VALUES(comments_enabled)`,
      [req.user.id, visibleStats.join(','), commentsEnabled]
    );
    res.json({ ok: true, visible_stats: visibleStats, comments_enabled: Boolean(commentsEnabled) });
  } catch (error) {
    console.error('[PATCH /player-profile/me/settings]', error);
    fail(res, 500, 'No se pudo guardar');
  }
});

/** POST /api/player-profile/me/banner — portada del perfil (form-data, clave "banner") */
router.post('/me/banner', uploadBanner.single('banner'), async (req, res) => {
  try {
    if (!req.file) return fail(res, 400, 'No se ha recibido ninguna imagen');
    const [[prev]] = await pool.query('SELECT banner_url FROM users WHERE id=? LIMIT 1', [req.user.id]);
    const fileUrl = `/uploads/banners/${req.file.filename}`;
    await pool.query('UPDATE users SET banner_url=? WHERE id=?', [fileUrl, req.user.id]);

    try {
      const prevUrl = prev?.banner_url || '';
      if (prevUrl.startsWith('/uploads/banners/')) {
        const prevPath = path.join(process.cwd(), prevUrl.replace(/^\//, '').split('?')[0]);
        if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
      }
    } catch (cleanupError) {
      console.warn('[POST /player-profile/me/banner] No se pudo borrar la portada anterior:', cleanupError?.message || cleanupError);
    }

    res.json({ ok: true, banner_url: fileUrl });
  } catch (error) {
    console.error('[POST /player-profile/me/banner]', error);
    fail(res, 500, 'Error subiendo la portada');
  }
});

/** DELETE /api/player-profile/me/banner — quita la portada */
router.delete('/me/banner', async (req, res) => {
  try {
    const [[prev]] = await pool.query('SELECT banner_url FROM users WHERE id=? LIMIT 1', [req.user.id]);
    await pool.query('UPDATE users SET banner_url=NULL WHERE id=?', [req.user.id]);
    try {
      const prevUrl = prev?.banner_url || '';
      if (prevUrl.startsWith('/uploads/banners/')) {
        const prevPath = path.join(process.cwd(), prevUrl.replace(/^\//, '').split('?')[0]);
        if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
      }
    } catch (cleanupError) {
      console.warn('[DELETE /player-profile/me/banner]', cleanupError?.message || cleanupError);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /player-profile/me/banner]', error);
    fail(res, 500, 'No se pudo quitar la portada');
  }
});

/** POST /api/player-profile/me/photos — sube una foto (form-data: "photo", opcional "match_id") */
router.post('/me/photos', uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) return fail(res, 400, 'No se ha recibido ninguna imagen');

    let matchId = null;
    const rawMatchId = Number(req.body?.match_id);
    if (Number.isInteger(rawMatchId) && rawMatchId > 0) {
      // Solo se puede etiquetar un partido que el propio jugador jugó de verdad.
      const [[played]] = await pool.query('SELECT 1 FROM match_player_stats WHERE user_id=? AND match_id=? LIMIT 1', [req.user.id, rawMatchId]);
      if (played) matchId = rawMatchId;
    }

    const caption = String(req.body?.caption || '').trim().slice(0, 140) || null;
    const fileUrl = `/uploads/profile-photos/${req.file.filename}`;

    const [result] = await pool.query(
      'INSERT INTO player_profile_photos (user_id, match_id, image_url, caption) VALUES (?,?,?,?)',
      [req.user.id, matchId, fileUrl, caption]
    );

    res.status(201).json({ ok: true, data: { id: result.insertId, image_url: fileUrl, caption, match_id: matchId } });
  } catch (error) {
    console.error('[POST /player-profile/me/photos]', error);
    fail(res, 500, 'No se pudo subir la foto');
  }
});

/** DELETE /api/player-profile/me/photos/:id — solo el dueño */
router.delete('/me/photos/:id', async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return fail(res, 400, 'ID inválido');
    const [[photo]] = await pool.query('SELECT image_url FROM player_profile_photos WHERE id=? AND user_id=? LIMIT 1', [id, req.user.id]);
    if (!photo) return fail(res, 404, 'Foto no encontrada');

    await pool.query('DELETE FROM player_profile_photos WHERE id=? AND user_id=?', [id, req.user.id]);
    try {
      const filePath = path.join(process.cwd(), photo.image_url.replace(/^\//, '').split('?')[0]);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('[DELETE /player-profile/me/photos/:id]', cleanupError?.message || cleanupError);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /player-profile/me/photos/:id]', error);
    fail(res, 500, 'No se pudo borrar la foto');
  }
});

/** POST /api/player-profile/:userId/comments — comentar en el perfil de otro jugador */
router.post('/:userId/comments', async (req, res) => {
  const targetId = positiveId(req.params.userId);
  if (!targetId) return fail(res, 400, 'Usuario no válido');

  try {
    if (await isBlocked(req.user.id, targetId)) return fail(res, 403, 'No puedes comentar aquí');

    const [[privacy]] = await pool.query('SELECT comments_enabled FROM user_social_privacy WHERE user_id=?', [targetId]);
    if (privacy && Number(privacy.comments_enabled) === 0) return fail(res, 403, 'Este jugador ha desactivado los comentarios');

    const [[myRow]] = await pool.query('SELECT COUNT(*) AS c FROM match_player_stats WHERE user_id=?', [req.user.id]);
    if (Number(myRow.c) < MIN_MATCHES_TO_COMMENT) {
      return fail(res, 403, `Necesitas haber jugado al menos ${MIN_MATCHES_TO_COMMENT} partidos para comentar`);
    }

    const body = String(req.body?.body || '').trim();
    if (!body) return fail(res, 400, 'Escribe algo antes de enviar');
    if (body.length > 500) return fail(res, 400, 'El comentario es demasiado largo');

    const [result] = await pool.query(
      'INSERT INTO player_profile_comments (profile_user_id, author_user_id, body) VALUES (?,?,?)',
      [targetId, req.user.id, body]
    );
    const [[author]] = await pool.query('SELECT name, avatar_url FROM users WHERE id=?', [req.user.id]);

    res.status(201).json({
      ok: true,
      data: {
        id: result.insertId,
        body,
        created_at: new Date(),
        author: { id: req.user.id, name: author.name, avatar_url: author.avatar_url },
        can_delete: true,
      },
    });
  } catch (error) {
    console.error('[POST /player-profile/:userId/comments]', error);
    fail(res, 500, 'No se pudo publicar el comentario');
  }
});

/** DELETE /api/player-profile/comments/:id — el autor, el dueño del perfil o un admin */
router.delete('/comments/:id', async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return fail(res, 400, 'ID inválido');
    const [[comment]] = await pool.query('SELECT profile_user_id, author_user_id FROM player_profile_comments WHERE id=?', [id]);
    if (!comment) return fail(res, 404, 'Comentario no encontrado');

    const isAllowed = req.user.id === comment.author_user_id || req.user.id === comment.profile_user_id || req.user.role === 'admin';
    if (!isAllowed) return fail(res, 403, 'No puedes borrar este comentario');

    await pool.query('DELETE FROM player_profile_comments WHERE id=?', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /player-profile/comments/:id]', error);
    fail(res, 500, 'No se pudo borrar el comentario');
  }
});

export default router;

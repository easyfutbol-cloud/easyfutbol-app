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
import { activePlusSql } from '../services/subscriptionService.js';
import { requireAuth } from '../middlewares/auth.js';
import { createSocialNotification, positiveId } from '../services/socialService.js';
import { getPlayerReputation, publicReputation } from '../services/playerReputationService.js';
import { equippedCosmetics } from '../services/engagementRules.js';
import { getProfileShowcase, getProfileViews, recordProfileView } from '../services/profileShowcaseService.js';
import { MIN_MATCHES_TO_REACT, getProfileReactions, isValidReaction, reactionFor } from '../services/profileReactionsService.js';
import { computePlayerCard, getMonthlyEvolution, normalizeProfileCustomization, parseProfileSections } from '../services/playerCardService.js';
import { ensureProfileSlug, getProfileStreak, getSeasonStats, getRecentForm, isValidSlug, profileShareUrl } from '../services/profileShareService.js';

const router = Router();
router.use(requireAuth);

const VISIBLE_STAT_KEYS = ['goals', 'assists', 'saves', 'mvp_count', 'matches_played', 'win_rate'];

const fail = (res, code, msg) => res.status(code).json({ ok: false, msg });

async function isBlocked(userId, otherId) {
  const [[row]] = await pool.query(
    'SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1',
    [userId, otherId, otherId, userId]
  );
  return Boolean(row);
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
      `SELECT u.id, u.name, u.avatar_url, u.banner_url, u.preferred_location, u.primary_position, u.secondary_position, u.dominant_foot,
              u.equipped_frame, u.equipped_title, u.public_slug, u.nickname, u.shirt_number, u.bio, u.favorite_team, u.profile_accent,
              ${activePlusSql('u.id')} AS is_plus
       FROM users u WHERE u.id=?`,
      [targetId]
    );
    if (!user) return fail(res, 404, 'Usuario no encontrado');
    user.is_plus = Boolean(Number(user.is_plus));
    user.cosmetics = equippedCosmetics(user.equipped_frame, user.equipped_title);
    delete user.equipped_frame;
    delete user.equipped_title;
    const shareUrl = profileShareUrl(user.public_slug);
    delete user.public_slug;

    await pool.query('INSERT IGNORE INTO user_social_privacy(user_id) VALUES (?)', [targetId]);
    const [[privacy]] = await pool.query(
      'SELECT visible_stats, comments_enabled, profile_sections FROM user_social_privacy WHERE user_id=?',
      [targetId]
    );
    const visibleStats = String(privacy?.visible_stats || '').split(',').map((s) => s.trim()).filter((s) => VISIBLE_STAT_KEYS.includes(s));
    // comments_enabled se reutiliza como "acepto reacciones" (sustituyen a los comentarios).
    const reactionsEnabled = Boolean(Number(privacy?.comments_enabled ?? 1));
    const sections = parseProfileSections(privacy?.profile_sections);

    const isOwner = req.user.id === targetId;
    const seasonStats = await getSeasonStats(pool, targetId);
    const stats = {};
    for (const key of visibleStats) stats[key] = seasonStats[key];

    const [photos] = await pool.query(
      `SELECT p.id, p.image_url, p.caption, p.created_at, p.match_id, m.title AS match_title
       FROM player_profile_photos p LEFT JOIN matches m ON m.id = p.match_id
       WHERE p.user_id=? ORDER BY p.created_at DESC LIMIT 30`,
      [targetId]
    );

    const recentForm = await getRecentForm(pool, targetId, {
      showGoals: isOwner || visibleStats.includes('goals'),
      showAssists: isOwner || visibleStats.includes('assists'),
    });
    const streak = await getProfileStreak(pool, targetId);
    const showcase = await getProfileShowcase(pool, targetId, isOwner ? null : visibleStats);
    if (!isOwner) {
      // Contar la visita nunca debe impedir ver el perfil.
      await recordProfileView(pool, targetId, req.user.id).catch((error) => console.error('[profile view]', error?.message || error));
    }
    const views = isOwner ? await getProfileViews(pool, targetId) : undefined;
    // El dueño siempre ve su carta y su evolución (para decidir si las enseña).
    const card = isOwner || sections.includes('card') ? computePlayerCard(seasonStats, user.primary_position) : null;
    const evolution = isOwner || sections.includes('evolution')
      ? await getMonthlyEvolution(pool, targetId, {
        show: {
          goals: isOwner || visibleStats.includes('goals'),
          assists: isOwner || visibleStats.includes('assists'),
          wins: isOwner || visibleStats.includes('win_rate'),
        },
      })
      : null;

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
      sections,
      card,
      evolution,
      all_stats: isOwner ? seasonStats : undefined,
      stats,
      reactions: {
        enabled: reactionsEnabled,
        can_react: !isOwner && reactionsEnabled && myMatchesPlayed >= MIN_MATCHES_TO_REACT,
        min_matches_to_react: MIN_MATCHES_TO_REACT,
        ...(await getProfileReactions(pool, targetId, req.user.id)),
      },
      // Las apps anteriores a las reacciones ocultan los comentarios con esto.
      comments_enabled: false,
      can_comment: false,
      comments: [],
      reputation: publicReputation(await getPlayerReputation(pool, targetId)),
      streak,
      recent_form: recentForm,
      share_url: shareUrl,
      showcase,
      views,
      photos: photos.map((p) => ({
        id: p.id,
        image_url: p.image_url,
        caption: p.caption,
        created_at: p.created_at,
        match_id: p.match_id,
        match_title: p.match_title,
      })),
    });
  } catch (error) {
    console.error('[GET /player-profile/:userId]', error);
    fail(res, 500, 'No se pudo cargar el perfil');
  }
});

/** GET /api/player-profile/me/share — enlace público de mi perfil (lo crea si hace falta) */
router.get('/me/share', async (req, res) => {
  try {
    const slug = await ensureProfileSlug(pool, req.user.id);
    res.json({ ok: true, slug, url: profileShareUrl(slug) });
  } catch (error) {
    console.error('[GET /player-profile/me/share]', error);
    fail(res, 500, 'No se pudo crear el enlace');
  }
});

/** GET /api/player-profile/me/views — visitas de mi perfil (solo el número) */
router.get('/me/views', async (req, res) => {
  try {
    res.json({ ok: true, views: await getProfileViews(pool, req.user.id) });
  } catch (error) {
    console.error('[GET /player-profile/me/views]', error);
    fail(res, 500, 'No se pudieron cargar las visitas');
  }
});

/** GET /api/player-profile/by-slug/:slug — para abrir en la app un enlace /jugador/<slug> */
router.get('/by-slug/:slug', async (req, res) => {
  try {
    if (!isValidSlug(req.params.slug)) return fail(res, 404, 'Perfil no encontrado');
    const [[row]] = await pool.query('SELECT id FROM users WHERE public_slug = ?', [req.params.slug]);
    if (!row) return fail(res, 404, 'Perfil no encontrado');
    if (await isBlocked(req.user.id, row.id)) return fail(res, 403, 'Este perfil no está disponible');
    res.json({ ok: true, user_id: row.id });
  } catch (error) {
    console.error('[GET /player-profile/by-slug/:slug]', error);
    fail(res, 500, 'No se pudo abrir el perfil');
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

/**
 * PATCH /api/player-profile/me/customization — apodo, dorsal, bio, equipo,
 * color del perfil y secciones (orden y cuáles se ven). Solo los campos enviados.
 */
router.patch('/me/customization', async (req, res) => {
  try {
    const result = normalizeProfileCustomization(req.body || {});
    if (!result.ok) return fail(res, 400, result.msg);
    const { profile_sections: sections, ...userFields } = result.values;

    const columns = Object.keys(userFields);
    if (columns.length) {
      await pool.query(
        `UPDATE users SET ${columns.map((c) => `${c}=?`).join(', ')} WHERE id=?`,
        [...columns.map((c) => userFields[c]), req.user.id]
      );
    }
    if (sections !== undefined) {
      await pool.query(
        `INSERT INTO user_social_privacy (user_id, profile_sections) VALUES (?,?)
         ON DUPLICATE KEY UPDATE profile_sections=VALUES(profile_sections)`,
        [req.user.id, sections]
      );
    }
    res.json({ ok: true, ...userFields, ...(sections !== undefined ? { sections: parseProfileSections(sections) } : {}) });
  } catch (error) {
    console.error('[PATCH /player-profile/me/customization]', error);
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

/** POST /api/player-profile/:userId/comments — retirado: los comentarios son ahora reacciones */
router.post('/:userId/comments', (_req, res) => fail(res, 410, 'Los comentarios se han sustituido por reacciones. Actualiza la app para reaccionar.'));

async function reactionTarget(req, res) {
  const targetId = positiveId(req.params.userId);
  if (!targetId) { fail(res, 400, 'Usuario no válido'); return null; }
  if (!isValidReaction(req.params.emoji)) { fail(res, 400, 'Reacción no válida'); return null; }
  if (targetId === req.user.id) { fail(res, 400, 'No puedes reaccionar a tu propio perfil'); return null; }
  if (await isBlocked(req.user.id, targetId)) { fail(res, 403, 'No puedes reaccionar aquí'); return null; }
  return targetId;
}

/** PUT /api/player-profile/:userId/reactions/:emoji — dar una reacción (idempotente) */
router.put('/:userId/reactions/:emoji', async (req, res) => {
  try {
    const targetId = await reactionTarget(req, res);
    if (!targetId) return;
    const [[target]] = await pool.query('SELECT id FROM users WHERE id=?', [targetId]);
    if (!target) return fail(res, 404, 'Usuario no encontrado');
    const [[privacy]] = await pool.query('SELECT comments_enabled FROM user_social_privacy WHERE user_id=?', [targetId]);
    if (privacy && Number(privacy.comments_enabled) === 0) return fail(res, 403, 'Este jugador ha desactivado las reacciones');
    const [[myRow]] = await pool.query('SELECT COUNT(*) AS c FROM match_player_stats WHERE user_id=?', [req.user.id]);
    if (Number(myRow.c) < MIN_MATCHES_TO_REACT) return fail(res, 403, 'Juega tu primer partido para poder reaccionar');

    const emoji = req.params.emoji;
    const [result] = await pool.query(
      'INSERT IGNORE INTO player_profile_reactions (profile_user_id, reactor_user_id, emoji) VALUES (?,?,?)',
      [targetId, req.user.id, emoji]
    );
    if (result.affectedRows) {
      // Un aviso como mucho por persona y día, aunque dé varios emojis.
      const [[actor]] = await pool.query('SELECT name FROM users WHERE id=?', [req.user.id]);
      const reaction = reactionFor(emoji);
      const day = new Date().toISOString().slice(0, 10);
      await createSocialNotification(pool, {
        userId: targetId, actorId: req.user.id, type: 'profile_reaction', entityType: 'user', entityId: req.user.id,
        title: `${reaction.emoji} ${reaction.label}`, body: `${actor.name} ha reaccionado a tu perfil`,
        data: { screen: 'PlayerSocialProfile', userId: targetId }, dedupeKey: `profile-reaction:${targetId}:${req.user.id}:${day}`,
      }).catch((error) => console.error('[profile reaction notify]', error?.message || error));
    }
    res.json({ ok: true, reactions: await getProfileReactions(pool, targetId, req.user.id) });
  } catch (error) {
    console.error('[PUT /player-profile/:userId/reactions/:emoji]', error);
    fail(res, 500, 'No se pudo reaccionar');
  }
});

/** DELETE /api/player-profile/:userId/reactions/:emoji — quitar mi reacción */
router.delete('/:userId/reactions/:emoji', async (req, res) => {
  try {
    const targetId = await reactionTarget(req, res);
    if (!targetId) return;
    await pool.query(
      'DELETE FROM player_profile_reactions WHERE profile_user_id=? AND reactor_user_id=? AND emoji=?',
      [targetId, req.user.id, req.params.emoji]
    );
    res.json({ ok: true, reactions: await getProfileReactions(pool, targetId, req.user.id) });
  } catch (error) {
    console.error('[DELETE /player-profile/:userId/reactions/:emoji]', error);
    fail(res, 500, 'No se pudo quitar la reacción');
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

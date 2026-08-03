const WEIGHTS = {
  outfield: [0.20, 0.20, 0.20, 0.25, 0.15],
  goalkeeper: [0.30, 0.15, 0.25, 0.15, 0.15],
};

export const CRITERIA = {
  outfield: ['Ofensivo', 'Defensivo', 'Juego colectivo', 'Impacto', 'Fair play'],
  goalkeeper: ['Rendimiento como portero', 'Juego colectivo y salida', 'Impacto', 'Regularidad y seguridad', 'Fair play'],
};

const validScore = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10;

export function calculateCompetitiveScore(role, criteria) {
  const normalizedRole = role === 'goalkeeper' ? 'goalkeeper' : 'outfield';
  if (!Array.isArray(criteria) || criteria.length !== 5 || criteria.some((value) => !validScore(value))) {
    const error = new Error('Todas las notas deben ser números enteros del 1 al 10');
    error.statusCode = 400;
    throw error;
  }
  const score = criteria.reduce((total, value, index) => total + Number(value) * WEIGHTS[normalizedRole][index], 0);
  return Math.round(score * 10) / 10;
}

async function refreshReviewStatus(db, reviewId) {
  const [[counts]] = await db.query(
    `SELECT COUNT(*) AS eligible,
      SUM(CASE WHEN status IN ('completed','not_evaluable') THEN 1 ELSE 0 END) AS resolved
     FROM competitive_match_evaluations WHERE review_id=?`,
    [reviewId]
  );
  const eligible = Number(counts?.eligible || 0);
  const resolved = Number(counts?.resolved || 0);
  const status = eligible > 0 && resolved === eligible ? 'completed' : resolved > 0 ? 'partial' : 'pending';
  await db.query(
    `UPDATE competitive_match_reviews SET status=?,eligible_players=?,resolved_players=?,
      completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,NOW()) ELSE NULL END WHERE id=?`,
    [status, eligible, resolved, status, reviewId]
  );
  return { status, eligible_players:eligible, resolved_players:resolved };
}

export async function syncCompetitiveMatch(db, matchId) {
  const [[context]] = await db.query(
    `SELECT m.id,m.starts_at,m.field_id,f.name AS field_name,
      cs.id AS season_id,cs.name AS season_name,cw.id AS week_id,cw.week_number
     FROM matches m
     LEFT JOIN fields f ON f.id=m.field_id
     JOIN competitive_seasons cs ON m.starts_at>=cs.starts_at AND m.starts_at<cs.ends_at
       AND cs.status IN ('active','scoring','completed')
     JOIN competitive_weeks cw ON cw.season_id=cs.id AND m.starts_at>=cw.starts_at AND m.starts_at<cw.ends_at
     WHERE m.id=? LIMIT 1`,
    [matchId]
  );
  if (!context) {
    const error = new Error('El partido no pertenece a una temporada competitiva');
    error.statusCode = 404;
    throw error;
  }
  await db.query(
    `INSERT INTO competitive_match_reviews (season_id,week_id,match_id)
     VALUES (?,?,?) ON DUPLICATE KEY UPDATE season_id=VALUES(season_id),week_id=VALUES(week_id)`,
    [context.season_id, context.week_id, matchId]
  );
  const [[review]] = await db.query('SELECT * FROM competitive_match_reviews WHERE match_id=? LIMIT 1', [matchId]);
  await db.query(
    `INSERT IGNORE INTO competitive_match_evaluations
      (review_id,season_id,week_id,match_id,user_id,inscription_id)
     SELECT ?,?,?,i.match_id,COALESCE(i.assigned_user_id,i.user_id),i.id
     FROM inscriptions i
     JOIN competitive_season_players csp
       ON csp.season_id=? AND csp.user_id=COALESCE(i.assigned_user_id,i.user_id)
       AND csp.status NOT IN ('inactive','withdrawn','disqualified')
     WHERE i.match_id=? AND i.status IN ('confirmed','paid','active')`,
    [review.id, context.season_id, context.week_id, context.season_id, matchId]
  );
  const state = await refreshReviewStatus(db, review.id);
  return { ...context, review_id:review.id, ...state };
}

export async function getCompetitiveEvaluations(db, matchId) {
  const context = await syncCompetitiveMatch(db, matchId);
  const [rows] = await db.query(
    `SELECT ce.*,u.name,u.email,
      COALESCE(mps.goals,i.goals,0) AS goals,
      COALESCE(mps.assists,i.assists,0) AS assists,
      COALESCE(mps.is_mvp,i.is_mvp,0) AS is_mvp,
      mps.result
     FROM competitive_match_evaluations ce
     JOIN users u ON u.id=ce.user_id
     LEFT JOIN inscriptions i ON i.id=ce.inscription_id
     LEFT JOIN match_player_stats mps ON mps.match_id=ce.match_id AND mps.user_id=ce.user_id
     WHERE ce.review_id=? ORDER BY ce.status='pending' DESC,u.name ASC`,
    [context.review_id]
  );
  return { match:context, criteria:CRITERIA, evaluations:rows };
}

async function saveRevision(db, current, adminId) {
  const revision = Number(current.revision_number || 0) + 1;
  await db.query(
    `INSERT INTO competitive_evaluation_revisions (evaluation_id,revision_number,snapshot,changed_by)
     VALUES (?,?,?,?)`,
    [current.id, revision, JSON.stringify(current), adminId]
  );
  return revision;
}

export async function saveCompetitiveEvaluation(db, evaluationId, payload, adminId) {
  const [[current]] = await db.query('SELECT * FROM competitive_match_evaluations WHERE id=? FOR UPDATE', [evaluationId]);
  if (!current) { const error = new Error('Valoración no encontrada'); error.statusCode = 404; throw error; }
  const role = payload?.player_role === 'goalkeeper' ? 'goalkeeper' : 'outfield';
  const criteria = [1,2,3,4,5].map((index) => Number(payload?.[`criterion_${index}`]));
  const computed = calculateCompetitiveScore(role, criteria);
  const hasManual = payload?.manual_score !== null && payload?.manual_score !== undefined && payload?.manual_score !== '';
  const manual = hasManual ? Number(payload.manual_score) : null;
  const reason = String(payload?.manual_reason || '').trim();
  if (hasManual && (!Number.isFinite(manual) || manual < 1 || manual > 10)) {
    const error = new Error('La puntuación manual debe estar entre 1 y 10'); error.statusCode = 400; throw error;
  }
  if (hasManual && !reason) { const error = new Error('Debes indicar el motivo del ajuste manual'); error.statusCode = 400; throw error; }
  const revision = await saveRevision(db, current, adminId);
  await db.query(
    `UPDATE competitive_match_evaluations SET player_role=?,status='completed',
      criterion_1=?,criterion_2=?,criterion_3=?,criterion_4=?,criterion_5=?,computed_score=?,
      manual_score=?,manual_reason=?,final_score=?,observations=?,evaluated_by=?,evaluated_at=NOW(),revision_number=? WHERE id=?`,
    [role,...criteria,computed,manual,hasManual ? reason : null,hasManual ? manual : computed,
      String(payload?.observations || '').trim() || null,adminId,revision,evaluationId]
  );
  const state = await refreshReviewStatus(db, current.review_id);
  return { id:evaluationId, computed_score:computed, final_score:hasManual ? manual : computed, ...state };
}

export async function markCompetitiveNotEvaluable(db, evaluationId, payload, adminId) {
  const [[current]] = await db.query('SELECT * FROM competitive_match_evaluations WHERE id=? FOR UPDATE', [evaluationId]);
  if (!current) { const error = new Error('Valoración no encontrada'); error.statusCode = 404; throw error; }
  const reason = String(payload?.observations || '').trim();
  if (!reason) { const error = new Error('Indica por qué el jugador no es evaluable'); error.statusCode = 400; throw error; }
  const revision = await saveRevision(db, current, adminId);
  await db.query(
    `UPDATE competitive_match_evaluations SET status='not_evaluable',observations=?,computed_score=NULL,
      manual_score=NULL,manual_reason=NULL,final_score=NULL,evaluated_by=?,evaluated_at=NOW(),revision_number=? WHERE id=?`,
    [reason, adminId, revision, evaluationId]
  );
  return refreshReviewStatus(db, current.review_id);
}

export async function listCompetitiveReviewMatches(db) {
  const [matches] = await db.query(
    `SELECT m.id FROM matches m JOIN competitive_seasons cs
       ON m.starts_at>=cs.starts_at AND m.starts_at<cs.ends_at
       AND cs.status IN ('active','scoring','completed')
     WHERE m.starts_at<NOW() ORDER BY m.starts_at DESC LIMIT 100`
  );
  for (const match of matches) await syncCompetitiveMatch(db, match.id);
  const [rows] = await db.query(
    `SELECT cmr.*,m.starts_at,f.name AS field_name,cs.name AS season_name,cw.week_number
     FROM competitive_match_reviews cmr JOIN matches m ON m.id=cmr.match_id
     LEFT JOIN fields f ON f.id=m.field_id JOIN competitive_seasons cs ON cs.id=cmr.season_id
     JOIN competitive_weeks cw ON cw.id=cmr.week_id
     WHERE cmr.eligible_players>0 ORDER BY FIELD(cmr.status,'partial','pending','completed'),m.starts_at DESC`
  );
  return rows;
}

import { pool } from '../config/db.js';
import { syncCompetitiveMatch } from './competitiveEvaluationService.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';

export async function scoreCompetitiveWeek(db, weekId, { force = false } = {}) {
  const [[week]] = await db.query(
    `SELECT cw.*,cs.status AS season_status FROM competitive_weeks cw
     JOIN competitive_seasons cs ON cs.id=cw.season_id WHERE cw.id=? FOR UPDATE`,
    [weekId]
  );
  if (!week) { const error = new Error('Semana no encontrada'); error.statusCode=404; throw error; }
  if (new Date(week.ends_at).getTime() > Date.now() && !force) { const error = new Error('La semana todavía no ha terminado'); error.statusCode=409; throw error; }
  if (week.status === 'scored' && !force) return { week_id:week.id, already_scored:true };

  const [matches] = await db.query('SELECT id FROM matches WHERE starts_at>=? AND starts_at<?', [week.starts_at,week.ends_at]);
  for (const match of matches) await syncCompetitiveMatch(db, match.id);
  const [[pending]] = await db.query(
    `SELECT COUNT(*) AS total FROM competitive_match_reviews
     WHERE week_id=? AND eligible_players>0 AND status<>'completed'`, [week.id]
  );
  if (Number(pending.total) > 0) {
    await db.query("UPDATE competitive_weeks SET status='pending_scoring' WHERE id=?", [week.id]);
    const error = new Error(`Quedan ${pending.total} partidos por completar`); error.statusCode=409; throw error;
  }

  const [players] = await db.query(
    `SELECT csp.user_id,u.name FROM competitive_season_players csp JOIN users u ON u.id=csp.user_id
     WHERE csp.season_id=? AND csp.status NOT IN ('inactive','withdrawn','disqualified') ORDER BY u.name`,
    [week.season_id]
  );
  for (const player of players) {
    const [[best]] = await db.query(
      `SELECT ce.id,ce.match_id,ce.final_score,
        (SELECT COUNT(*) FROM competitive_match_evaluations all_ce
         WHERE all_ce.week_id=? AND all_ce.user_id=? AND all_ce.status='completed') AS eligible_matches
       FROM competitive_match_evaluations ce JOIN competitive_match_reviews cmr ON cmr.id=ce.review_id
       WHERE ce.week_id=? AND ce.user_id=? AND ce.status='completed' AND cmr.status='completed'
       ORDER BY ce.final_score DESC,ce.evaluated_at ASC,ce.id ASC LIMIT 1`,
      [week.id,player.user_id,week.id,player.user_id]
    );
    await db.query(
      `INSERT INTO competitive_week_scores
       (season_id,week_id,user_id,best_evaluation_id,best_match_id,weekly_score,eligible_matches,scored_at)
       VALUES (?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE best_evaluation_id=VALUES(best_evaluation_id),
       best_match_id=VALUES(best_match_id),weekly_score=VALUES(weekly_score),eligible_matches=VALUES(eligible_matches),scored_at=NOW()`,
      [week.season_id,week.id,player.user_id,best?.id || null,best?.match_id || null,Number(best?.final_score || 0),Number(best?.eligible_matches || 0)]
    );
  }

  const [ranking] = await db.query(
    `SELECT cws.user_id,cws.weekly_score,COALESCE(SUM(previous.weekly_score),0) AS season_score,u.name,
       csp.location_id,csp.division_id
     FROM competitive_week_scores cws JOIN users u ON u.id=cws.user_id
     JOIN competitive_season_players csp ON csp.season_id=cws.season_id AND csp.user_id=cws.user_id
     LEFT JOIN competitive_week_scores previous ON previous.season_id=cws.season_id
       AND previous.user_id=cws.user_id AND previous.week_id<=cws.week_id
     WHERE cws.week_id=? GROUP BY cws.user_id,cws.weekly_score,u.name,csp.location_id,csp.division_id
     ORDER BY csp.location_id,csp.division_id,season_score DESC,cws.weekly_score DESC,u.name ASC`, [week.id]
  );
  const [[previousWeek]] = await db.query(
    `SELECT id FROM competitive_weeks WHERE season_id=? AND week_number<? AND status='scored'
     ORDER BY week_number DESC LIMIT 1`, [week.season_id,week.week_number]
  );
  await db.query('DELETE FROM competitive_week_rankings WHERE week_id=?', [week.id]);
  const cohortPositions=new Map();
  for (let index=0; index<ranking.length; index+=1) {
    const row=ranking[index]; const cohortKey=`${row.location_id}:${row.division_id}`;
    const position=(cohortPositions.get(cohortKey) || 0)+1; cohortPositions.set(cohortKey,position);
    let previousPosition=null;
    if (previousWeek) {
      const [[previous]]=await db.query('SELECT position FROM competitive_week_rankings WHERE week_id=? AND user_id=?',[previousWeek.id,row.user_id]);
      previousPosition=previous?.position || null;
    }
    const change=previousPosition ? previousPosition-position : 0;
    await db.query(
      `INSERT INTO competitive_week_rankings
       (season_id,week_id,user_id,position,previous_position,position_change,weekly_score,season_score)
       VALUES (?,?,?,?,?,?,?,?)`,
      [week.season_id,week.id,row.user_id,position,previousPosition,change,row.weekly_score,row.season_score]
    );
    const [[weekCount]]=await db.query('SELECT COUNT(*) AS total FROM competitive_week_scores WHERE season_id=? AND user_id=? AND weekly_score>0',[week.season_id,row.user_id]);
    await db.query(
      `INSERT INTO competitive_season_standings
       (season_id,user_id,position,previous_position,position_change,total_score,scored_weeks,latest_week_id)
       VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE position=VALUES(position),previous_position=VALUES(previous_position),
       position_change=VALUES(position_change),total_score=VALUES(total_score),scored_weeks=VALUES(scored_weeks),latest_week_id=VALUES(latest_week_id)`,
      [week.season_id,row.user_id,position,previousPosition,change,row.season_score,weekCount.total,week.id]
    );
  }
  await db.query("UPDATE competitive_weeks SET status='scored',scored_at=NOW() WHERE id=?", [week.id]);
  return { week_id:week.id, players:ranking.length, status:'scored' };
}

export async function scoreDueCompetitiveWeeks(db=pool) {
  const [weeks]=await db.query(
    `SELECT cw.id FROM competitive_weeks cw JOIN competitive_seasons cs ON cs.id=cw.season_id
     WHERE cw.ends_at<=NOW() AND cw.status IN ('active','pending_scoring','upcoming')
       AND cs.status IN ('active','scoring') ORDER BY cw.ends_at`
  );
  const results=[];
  for (const week of weeks) {
    const conn=await db.getConnection();
    try { await conn.beginTransaction(); const result=await scoreCompetitiveWeek(conn,week.id); await conn.commit(); results.push(result); }
    catch(error) { await conn.rollback(); results.push({ week_id:week.id,error:error.message }); }
    finally { conn.release(); }
  }
  return results;
}

let schedulerStarted=false; let schedulerRunning=false; let lastMadridDate='';
export function startCompetitiveScoringScheduler() {
  if (schedulerStarted) return; schedulerStarted=true;
  registerScheduler('competitive-scoring', { maxAgeSeconds: 35 * 60 });
  const run=async()=>{
    if (schedulerRunning) return;
    const parts=new Intl.DateTimeFormat('en-CA',{ timeZone:'Europe/Madrid',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23' }).formatToParts(new Date());
    const value=(type)=>parts.find((part)=>part.type===type)?.value;
    const madridDate=`${value('year')}-${value('month')}-${value('day')}`;
    if (value('weekday')!=='Tue' || Number(value('hour'))<6 || lastMadridDate===madridDate) {
      markSchedulerSuccess('competitive-scoring');
      return;
    }
    schedulerRunning=true;
    try { const results=await scoreDueCompetitiveWeeks(); if (results.every((result)=>!result.error)) { lastMadridDate=madridDate; markSchedulerSuccess('competitive-scoring'); } else { markSchedulerFailure('competitive-scoring', results.find((result)=>result.error)?.error); } console.log('[COMPETITIVE SCORING]',results); }
    catch(error) { markSchedulerFailure('competitive-scoring', error); console.error('[COMPETITIVE SCORING]',error); }
    finally { schedulerRunning=false; }
  };
  run(); const timer=setInterval(run,15*60*1000); timer.unref?.();
}

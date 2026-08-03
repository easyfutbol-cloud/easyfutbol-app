import { pool } from '../config/db.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';

async function publishNextScheduledMatch() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[job]] = await conn.query(
      `SELECT * FROM scheduled_match_publications
       WHERE status='pending' AND publish_at <= NOW()
       ORDER BY publish_at ASC, id ASC
       LIMIT 1 FOR UPDATE`
    );
    if (!job) {
      await conn.rollback();
      return null;
    }

    await conn.query("UPDATE scheduled_match_publications SET status='publishing' WHERE id=?", [job.id]);

    let fieldId = Number(job.field_id || 0) || null;
    if (!fieldId) {
      const [[field]] = await conn.query(
        'SELECT id FROM fields WHERE name=? AND city=? LIMIT 1',
        [job.field_name, job.city]
      );
      if (field?.id) fieldId = Number(field.id);
      else {
        const [createdField] = await conn.query(
          'INSERT INTO fields (name, city) VALUES (?,?)',
          [job.field_name, job.city]
        );
        fieldId = createdField.insertId;
      }
    }

    const [match] = await conn.query(
      `INSERT INTO matches
       (title, field_id, city, location_id, starts_at, duration_min, price_eur, easypass_cost, capacity, spots_taken, status, has_aftergame)
       VALUES (?,?,?,?,?,?,?,?,?,0,'scheduled',?)`,
      [job.title, fieldId, job.city, job.location_id, job.starts_at, job.duration_min, job.price_eur, job.easypass_cost, job.capacity, job.has_aftergame]
    );

    await conn.query(
      `UPDATE scheduled_match_publications
       SET status='published', published_match_id=?, published_at=NOW(), error_message=NULL
       WHERE id=?`,
      [match.insertId, job.id]
    );
    await conn.commit();
    console.log(`[SCHEDULED MATCHES] Publicado job ${job.id} como partido ${match.insertId}`);
    return true;
  } catch (error) {
    await conn.rollback();
    console.error('[SCHEDULED MATCHES] Error publicando:', error);
    throw error;
  } finally {
    conn.release();
  }
}

let started = false;
let running = false;

export function startScheduledMatchPublisher() {
  if (started) return;
  started = true;
  registerScheduler('scheduled-match-publisher', { maxAgeSeconds: 3 * 60 });
  const run = async () => {
    if (running) return;
    running = true;
    try {
      let published = true;
      while (published) published = await publishNextScheduledMatch();
      markSchedulerSuccess('scheduled-match-publisher');
    } catch (error) {
      markSchedulerFailure('scheduled-match-publisher', error);
      console.error('[SCHEDULED MATCHES] Error del programador:', error?.message || error);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, 60 * 1000);
  timer.unref?.();
}

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import mysql from 'mysql2/promise';

import { grantSubscriptionEasyPass } from '../../src/services/subscriptionGrantService.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
const database = String(process.env.TEST_DB_NAME || '');

function assertSafeTestDatabase() {
  if (!enabled) return;
  if (!/(^test_|_test$)/i.test(database) || database.toLowerCase() === 'easyfutbol') {
    throw new Error('TEST_DB_NAME debe ser una base aislada cuyo nombre empiece por test_ o termine en _test');
  }
}

async function reserveLastSpot(pool, { userId, matchId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[match]] = await conn.query(
      'SELECT capacity, spots_taken FROM matches WHERE id=? FOR UPDATE',
      [matchId]
    );
    if (!match || Number(match.spots_taken) >= Number(match.capacity)) {
      await conn.rollback();
      return false;
    }
    await conn.query(
      "INSERT INTO inscriptions (user_id, match_id, status) VALUES (?, ?, 'confirmed')",
      [userId, matchId]
    );
    await conn.query('UPDATE matches SET spots_taken=spots_taken+1 WHERE id=?', [matchId]);
    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

describe('transacciones MySQL críticas', { skip: !enabled }, () => {
  let pool;

  before(async () => {
    assertSafeTestDatabase();
    pool = mysql.createPool({
      host: process.env.TEST_DB_HOST || '127.0.0.1',
      port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER,
      password: process.env.TEST_DB_PASSWORD,
      database,
      connectionLimit: 4,
    });

    await pool.query('DROP TABLE IF EXISTS easypass_transactions');
    await pool.query('DROP TABLE IF EXISTS subscription_monthly_grants');
    await pool.query('DROP TABLE IF EXISTS inscriptions');
    await pool.query('DROP TABLE IF EXISTS matches');
    await pool.query('DROP TABLE IF EXISTS users');

    await pool.query(`CREATE TABLE users (
      id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      easypass_balance INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE matches (
      id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      capacity INT NOT NULL,
      spots_taken INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE inscriptions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      match_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(32) NOT NULL
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE subscription_monthly_grants (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      plan_code VARCHAR(32) NOT NULL,
      stripe_reference VARCHAR(255) NOT NULL,
      easypass_amount INT NOT NULL,
      UNIQUE KEY uq_subscription_grant_reference (stripe_reference)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE easypass_transactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(32) NOT NULL,
      amount INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      payment_reference VARCHAR(255) NULL,
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB`);
  });

  after(async () => {
    await pool?.end();
  });

  test('dos reservas concurrentes no venden dos veces la última plaza', async () => {
    await pool.query('DELETE FROM inscriptions');
    await pool.query('DELETE FROM matches');
    await pool.query('INSERT INTO matches (id, capacity, spots_taken) VALUES (1, 16, 15)');

    const results = await Promise.all([
      reserveLastSpot(pool, { userId: 101, matchId: 1 }),
      reserveLastSpot(pool, { userId: 102, matchId: 1 }),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
    const [[match]] = await pool.query('SELECT spots_taken FROM matches WHERE id=1');
    const [[count]] = await pool.query("SELECT COUNT(*) AS total FROM inscriptions WHERE match_id=1 AND status='confirmed'");
    assert.equal(match.spots_taken, 16);
    assert.equal(count.total, 1);
  });

  test('un error revierte saldo e inscripción dentro de la misma transacción', async () => {
    await pool.query('DELETE FROM inscriptions');
    await pool.query('DELETE FROM users');
    await pool.query('INSERT INTO users (id, easypass_balance) VALUES (201, 3)');
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();
      await conn.query('UPDATE users SET easypass_balance=easypass_balance-1 WHERE id=201');
      await conn.query("INSERT INTO inscriptions (user_id, match_id, status) VALUES (201, 99, 'confirmed')");
      throw new Error('fallo simulado antes del commit');
    } catch {
      await conn.rollback();
    } finally {
      conn.release();
    }

    const [[user]] = await pool.query('SELECT easypass_balance FROM users WHERE id=201');
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM inscriptions WHERE user_id=201');
    assert.equal(user.easypass_balance, 3);
    assert.equal(count.total, 0);
  });

  test('el mismo webhook mensual solo acredita EasyPass una vez', async () => {
    await pool.query('DELETE FROM easypass_transactions');
    await pool.query('DELETE FROM subscription_monthly_grants');
    await pool.query('DELETE FROM users');
    await pool.query('INSERT INTO users (id, easypass_balance) VALUES (301, 0)');

    const payload = {
      userId: 301,
      planCode: 'pro',
      amount: 4,
      reference: 'subscription_invoice:integration_001',
    };
    assert.equal(await grantSubscriptionEasyPass(pool, payload), true);
    assert.equal(await grantSubscriptionEasyPass(pool, payload), false);

    const [[user]] = await pool.query('SELECT easypass_balance FROM users WHERE id=301');
    const [[transactions]] = await pool.query('SELECT COUNT(*) AS total FROM easypass_transactions WHERE user_id=301');
    assert.equal(user.easypass_balance, 4);
    assert.equal(transactions.total, 1);
  });
});


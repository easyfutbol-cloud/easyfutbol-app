import mysql from 'mysql2/promise';
import 'dotenv/config';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

export async function assertDB() {
  try {
    const c = await pool.getConnection();
    await c.ping();
    c.release();
    console.log('✅ DB OK');
  } catch (err) {
    console.error('❌ Error conectando a la DB', err);
    throw err;
  }
}
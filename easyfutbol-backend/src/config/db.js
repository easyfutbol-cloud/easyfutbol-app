import express from 'express';
import { pool } from '../config/db.js';
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM matches');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error retrieving matches' });
  }
});

router.post('/', async (req, res) => {
  const { teamA, teamB, date } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO matches (teamA, teamB, date) VALUES (?, ?, ?)',
      [teamA, teamB, date]
    );
    res.status(201).json({ id: result.insertId, teamA, teamB, date });
  } catch (error) {
    res.status(500).json({ error: 'Error creating match' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { teamA, teamB, date } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE matches SET teamA = ?, teamB = ?, date = ? WHERE id = ?',
      [teamA, teamB, date, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json({ id, teamA, teamB, date });
  } catch (error) {
    res.status(500).json({ error: 'Error updating match' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM matches WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json({ message: 'Match deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting match' });
  }
});

export default router;
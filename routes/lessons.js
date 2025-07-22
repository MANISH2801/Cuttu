// routes/lessons.js

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * @swagger
 * /chapters/{chapterId}/lessons:
 *   get:
 *     summary: Get all lessons in a chapter
 *     tags: [Lessons]
 */
router.get('/:chapterId/lessons', async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { rows } = await pool.query(
      'SELECT id, title, content FROM lessons WHERE chapter_id = $1 ORDER BY id',
      [chapterId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching lessons:', err);
    res.status(500).json({ error: 'Server error while fetching lessons' });
  }
});

/**
 * @swagger
 * /chapters/{chapterId}/lessons:
 *   post:
 *     summary: Add a lesson (Admin only)
 *     tags: [Lessons]
 */
router.post('/:chapterId/lessons', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content required' });
    }

    await pool.query(
      'INSERT INTO lessons (chapter_id, title, content) VALUES ($1, $2, $3)',
      [chapterId, title, content]
    );

    res.status(201).json({ message: 'Lesson created successfully' });
  } catch (err) {
    console.error('Error creating lesson:', err);
    res.status(500).json({ error: 'Server error while creating lesson' });
  }
});

router.put('/lessons/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    await pool.query(
      'UPDATE lessons SET title=$1, content=$2 WHERE id=$3',
      [title, content, id]
    );

    res.json({ message: 'Lesson updated successfully' });
  } catch (err) {
    console.error('Error updating lesson:', err);
    res.status(500).json({ error: 'Server error while updating lesson' });
  }
});

router.delete('/lessons/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM lessons WHERE id=$1', [id]);
    res.json({ message: 'Lesson deleted successfully' });
  } catch (err) {
    console.error('Error deleting lesson:', err);
    res.status(500).json({ error: 'Server error while deleting lesson' });
  }
});

module.exports = router;

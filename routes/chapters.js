/**
 * @swagger
 * tags:
 *   name: Chapters
 *   description: Chapter management endpoints
 */

const express = require('express');
const pool = require('../db');
const router = express.Router();

// 🔐 Middleware to protect admin routes
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied (admin only)' });
  }
  next();
}

/**
 * @route POST /chapters
 * @desc Create a new chapter
 * @access Admin only
 */
router.post('/', isAdmin, async (req, res) => {
  const { course_id, title } = req.body;

  if (!course_id || !title) {
    return res.status(400).json({ error: 'course_id and title are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO chapters (course_id, title, created_at) VALUES ($1, $2, NOW()) RETURNING *',
      [course_id, title]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating chapter:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route PUT /chapters/:id
 * @desc Update a chapter title
 * @access Admin only
 */
router.put('/:id', isAdmin, async (req, res) => {
  const { title } = req.body;
  const chapterId = req.params.id;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE chapters SET title=$1 WHERE id=$2 RETURNING *',
      [title, chapterId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating chapter:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route DELETE /chapters/:id
 * @desc Delete a chapter
 * @access Admin only
 */
router.delete('/:id', isAdmin, async (req, res) => {
  const chapterId = req.params.id;

  try {
    const result = await pool.query('DELETE FROM chapters WHERE id=$1 RETURNING *', [chapterId]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    res.json({ message: 'Chapter deleted' });
  } catch (err) {
    console.error('Error deleting chapter:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route GET /chapters/:courseId
 * @desc Get all chapters for a course
 * @access Authenticated (any user)
 */
router.get('/:courseId', async (req, res) => {
  const courseId = req.params.courseId;

  try {
    const result = await pool.query(
      'SELECT * FROM chapters WHERE course_id=$1 ORDER BY created_at ASC',
      [courseId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching chapters:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

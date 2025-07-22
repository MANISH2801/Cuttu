/**
 * @swagger
 * tags:
 *   name: Lessons
 *   description: Lesson endpoints (inside chapters)
 */

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
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chapter ID
 *     responses:
 *       200:
 *         description: List of lessons
 */
router.get('/:chapterId/lessons', async (req, res) => {
  const { chapterId } = req.params;
  const { rows } = await pool.query(
    'SELECT id, title, content FROM lessons WHERE chapter_id = $1 ORDER BY id',
    [chapterId]
  );
  res.json(rows);
});

/**
 * @swagger
 * /chapters/{chapterId}/lessons:
 *   post:
 *     summary: Add a new lesson to a chapter (Admin only)
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: chapterId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Chapter ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *             required:
 *               - title
 *               - content
 *     responses:
 *       201:
 *         description: Lesson created
 */
router.post('/:chapterId/lessons', authenticate, authorize('admin'), async (req, res) => {
  const { chapterId } = req.params;
  const { title, content } = req.body;

  await pool.query(
    'INSERT INTO lessons (chapter_id, title, content) VALUES ($1, $2, $3)',
    [chapterId, title, content]
  );

  res.status(201).json({ message: 'Lesson created successfully' });
});

/**
 * @swagger
 * /lessons/{id}:
 *   put:
 *     summary: Update a lesson (Admin only)
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Lesson ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Lesson updated
 */
router.put('/lessons/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;

  await pool.query(
    'UPDATE lessons SET title=$1, content=$2 WHERE id=$3',
    [title, content, id]
  );

  res.json({ message: 'Lesson updated successfully' });
});

/**
 * @swagger
 * /lessons/{id}:
 *   delete:
 *     summary: Delete a lesson (Admin only)
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Lesson ID
 *     responses:
 *       200:
 *         description: Lesson deleted
 */
router.delete('/lessons/:id', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.params;

  await pool.query('DELETE FROM lessons WHERE id=$1', [id]);

  res.json({ message: 'Lesson deleted successfully' });
});

module.exports = router;

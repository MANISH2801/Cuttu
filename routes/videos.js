
/**
 * @swagger
 * tags:
 *   name: Videos
 *   description: Course video endpoints
 */

const express = require('express');
const pool = require('../db');
const router = express.Router();

/**
 * @swagger
 * /courses/{id}/videos:
 *   get:
 *     summary: Get all videos for a course
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Course ID
 *     responses:
 *       200:
 *         description: List of videos
 */
router.get('/:id/videos', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    'SELECT id, title, url, is_live FROM videos WHERE course_id=$1 ORDER BY id',
    [id]
  );
  res.json(rows);
});

/**
 * @swagger
 * /courses/{id}/videos:
 *   post:
 *     summary: Add a new video to a course
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Course ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               url:
 *                 type: string
 *               is_live:
 *                 type: boolean
 *             required:
 *               - title
 *               - url
 *     responses:
 *       201:
 *         description: Video added successfully
 *       400:
 *         description: A live video already exists for this course
 */
router.post('/:id/videos', async (req, res) => {
  const { id } = req.params;
  const { title, url, is_live } = req.body;

  if (is_live === true) {
    const existingLive = await pool.query(
      'SELECT * FROM videos WHERE course_id = $1 AND is_live = true',
      [id]
    );
    if (existingLive.rows.length > 0) {
      return res.status(400).json({ message: 'A live video already exists for this course.' });
    }
  }

  await pool.query(
    'INSERT INTO videos (course_id, title, url, is_live) VALUES ($1, $2, $3, $4)',
    [id, title, url, is_live || false]
  );

  res.status(201).json({ message: 'Video added successfully' });
});

module.exports = router;

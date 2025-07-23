/**
 * @swagger
 * tags:
 *   name: Videos
 *   description: Manage video links for a course
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticate = require('../middlewares/auth').authenticate;
const isAdmin = require('../middlewares/isAdmin');

/**
 * @swagger
 * /videos/live/{courseId}:
 *   get:
 *     summary: Get the live video link for a specific course
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the course
 *     responses:
 *       200:
 *         description: Live video link returned
 *       404:
 *         description: No live video found
 *       500:
 *         description: Failed to fetch live video
 */
router.get('/live/:courseId', async (req, res) => {
  const { courseId } = req.params;

  try {
    const { rows } = await pool.query(`
      SELECT id, name AS title, live_video AS link
      FROM courses
      WHERE id = $1 AND live_video IS NOT NULL
    `, [courseId]);

    if (!rows[0]) {
      return res.status(404).json({ error: 'No live video found for this course' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Error fetching live video:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /videos/{courseId}:
 *   put:
 *     summary: Update video links for a specific course (admin only)
 *     tags: [Videos]
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the course to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_video:
 *                 type: string
 *                 example: https://youtube.com/embed/abc123
 *               live_video:
 *                 type: string
 *                 example: https://youtube.com/embed/live456
 *               archived_video:
 *                 type: string
 *                 example: https://youtube.com/embed/arch789
 *     responses:
 *       200:
 *         description: Video links updated successfully
 *       400:
 *         description: No fields provided to update
 *       500:
 *         description: Failed to update video links
 */
router.put('/:courseId', authenticate, isAdmin, async (req, res) => {
  const { courseId } = req.params;
  const { first_video, live_video, archived_video } = req.body;

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (first_video !== undefined) {
      fields.push(`first_video = $${idx++}`);
      values.push(first_video);
    }
    if (live_video !== undefined) {
      fields.push(`live_video = $${idx++}`);
      values.push(live_video);
    }
    if (archived_video !== undefined) {
      fields.push(`archived_video = $${idx++}`);
      values.push(archived_video);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    fields.push(`updated_at = NOW()`);
    const query = `UPDATE courses SET ${fields.join(', ')} WHERE id = $${idx}`;
    values.push(courseId);

    await pool.query(query, values);

    res.json({ message: 'Video links updated successfully' });
  } catch (err) {
    console.error('Video update error:', err.message);
    res.status(500).json({ error: 'Failed to update video links' });
  }
});

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Videos
 *   description: Manage video links for a course
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

/**
 * @swagger
 * /videos/live:
 *   get:
 *     summary: Get the current live video link for all users
 *     tags: [Videos]
 *     responses:
 *       200:
 *         description: Live video link returned
 *       500:
 *         description: Failed to fetch live video
 */
router.get('/live', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name AS title, live_video AS link
      FROM courses
      WHERE live_video IS NOT NULL
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 1
    `);

    if (!rows[0]) {
      return res.status(404).json({ error: 'No live video found' });
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
 *     summary: Update video links for a course (admin only)
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
 *       500:
 *         description: Failed to update video links
 */
router.put('/:courseId', authenticate, isAdmin, async (req, res) => {
  const { courseId } = req.params;
  const { first_video, live_video, archived_video } = req.body;

  try {
    await pool.query(
      `UPDATE courses
       SET first_video=$1, live_video=$2, archived_video=$3, updated_at=NOW()
       WHERE id=$4`,
      [first_video, live_video, archived_video, courseId]
    );

    res.json({ message: 'Video links updated successfully' });
  } catch (err) {
    console.error('Video update error:', err.message);
    res.status(500).json({ error: 'Failed to update video links' });
  }
});
module.exports = router;
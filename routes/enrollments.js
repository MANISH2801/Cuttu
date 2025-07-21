/**
 * @swagger
 * tags:
 *   name: Enrollments
 *   description: Handles course enrollments and status checks
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../middlewares/auth'); // ✅ Correct JWT auth middleware

/**
 * @swagger
 * /enrollments/{id}/enroll:
 *   post:
 *     summary: Enroll the authenticated user in a course
 *     tags: [Enrollments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Course ID
 *     responses:
 *       200:
 *         description: User enrolled successfully
 *       500:
 *         description: Failed to enroll user
 */
// POST /enrollments/:id/enroll — Enroll a user into a course (after payment)
router.post('/:id/enroll', authenticate, async (req, res) => {
  const userId = req.user.id;
  const courseId = req.params.id;

  try {
    await pool.query(
      `INSERT INTO enrollments (user_id, course_id, enrolled_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT DO NOTHING`,
      [userId, courseId]
    );

    res.status(200).json({ message: 'User enrolled successfully' });
  } catch (err) {
    console.error('Enrollment error:', err.message);
    res.status(500).json({ error: 'Failed to enroll user' });
  }
});
/**
 * @swagger
 * /enrollments/{id}/status:
 *   get:
 *     summary: Check if the authenticated user is enrolled in the course
 *     tags: [Enrollments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Enrollment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enrolled:
 *                   type: boolean
 *       500:
 *         description: Failed to fetch enrollment status
 */
// GET /enrollments/:id/status — Check if user is enrolled
router.get('/:id/status', authenticate, async (req, res) => {
  const userId = req.user.id;
  const courseId = req.params.id;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM enrollments WHERE user_id=$1 AND course_id=$2`,
      [userId, courseId]
    );

    const isEnrolled = rows.length > 0;
    res.json({ enrolled: isEnrolled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enrollment status' });
  }
});

module.exports = router;
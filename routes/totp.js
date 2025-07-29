/**
 * @swagger
 * tags:
 *   name: CAPTCHA
 *   description: CAPTCHA verification endpoint
 */
// routes/captcha.js
const express = require('express');
const { authenticate } = require('../middlewares/auth');   // JWT middleware
const pool = require('../db');

const router = express.Router();

// Protect everything below
router.use(authenticate);

/**
 * POST /auth/captcha/verify
 * Body: { captchaAnswer }
 */
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { captchaAnswer } = req.body;

    // Check if captchaAnswer is provided
    if (!captchaAnswer) return res.status(400).json({ error: 'Captcha answer required' });

    // The correct answer to the math question (for example: 89 + 51)
    const correctAnswer = 140;  // Modify this with your random question logic

    // Verify if the answer is correct
    if (parseInt(captchaAnswer) !== correctAnswer) {
      return res.status(400).json({ error: 'Incorrect CAPTCHA answer' });
    }

    // ✅ CAPTCHA verification passed, now proceed with regular flow (e.g., enabling 2FA or marking the user as verified)
    await pool.query(
      'UPDATE users SET captcha_verified = true WHERE id = $1',
      [req.user.id]
    );

    res.json({ message: 'CAPTCHA verification successful ✅' });
  } catch (err) {
    console.error('[CAPTCHA VERIFY ERROR]', err);
    res.status(500).json({ error: 'Unable to verify CAPTCHA due to server error' });
  }
});

module.exports = router;

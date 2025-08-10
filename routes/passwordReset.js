/**
 * @swagger
 * tags:
 *   name: PasswordReset
 *   description: Password reset endpoints
 */
// routes/passwordReset.js
const express = require('express');
const pool = require('../db');
const crypto = require('crypto');
const sendEmail = require('../utils/email');

const router = express.Router();

// This should be placed in your passwordReset.js or the relevant file
async function triggerPasswordReset(userId) {
  try {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // Convert to seconds

    // Save reset token to the database
    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, to_timestamp($3))',
      [userId, resetToken, expiresAt]
    );

    return { success: true };
  } catch (err) {
    console.error('[Password Reset Error]', err);
    return { success: false, error: 'Failed to trigger password reset.' };
  }
}



/**
 * POST /auth/request-password-reset
 * Body: { email }
 */
// POST /auth/request-password-reset
// In your existing /request-password-reset endpoint
router.post('/request-password-reset', async (req, res) => {
  const { email, recaptchaToken } = req.body;

  if (!recaptchaToken) {
    return res.status(400).json({ error: 'reCAPTCHA token is required.' });
  }

  const secretKey = 'your-recaptcha-secret-key';
  const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;

  try {
    const verifyRes = await fetch(verifyURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.success || verifyData.score < 0.5) {
      return res.status(401).json({ error: 'reCAPTCHA verification failed' });
    }

    const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const userId = rows[0].id;
    const resetResult = await triggerPasswordReset(userId);

    if (resetResult.success) {
      return res.json({ message: 'Password reset initiated. Please check your email for further instructions.' });
    } else {
      return res.status(500).json({ error: resetResult.error || 'Failed to password reset.' });
    }

  } catch (err) {
    console.error('[Password Reset Error]', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

/**
 * POST /auth/reset-password
 * Body: { token, password }
 */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token & password required' });

  const { rows } = await pool.query(
    'SELECT user_id, expires_at FROM password_resets WHERE token=$1',
    [token]
  );
  if (!rows.length) return res.status(400).json({ error: 'Invalid token' });

  const { user_id, expires_at } = rows[0];
  if (new Date(expires_at) < new Date()) return res.status(400).json({ error: 'Token expired' });

  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, user_id]);
  await pool.query('DELETE FROM password_resets WHERE token=$1', [token]);

  res.json({ message: 'Password reset successful' });
});

module.exports = router;
/**
 * @swagger
 * tags:
 *   name: PasswordReset
 *   description: Password reset endpoints
 */
// routes/passwordReset.js
const fetch = require('node-fetch');
const express = require('express');
const pool = require('../db');
const crypto = require('crypto');  // For generating the reset token
const sendEmail = require('../utils/email');  // Email sending function

const router = express.Router();
/**
 * POST /auth/request-password-reset
 * Body: { email }
 */
// POST /auth/request-password-reset
// In your existing /request-password-reset endpoint
router.post('/request-password-reset', async (req, res) => {
  const { email, recaptchaToken } = req.body;

  // Check if reCAPTCHA token is provided
  if (!recaptchaToken) {
    return res.status(400).json({ error: 'reCAPTCHA token is required.' });
  }

  // Verify reCAPTCHA with Google
  const secretKey = '6Lclc5MrAAAAADXpREb6CaedI5Ea5r5hK-336vE3'; // Use your actual secret key
  const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`;

  try {
    const verifyRes = await fetch(verifyURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const verifyData = await verifyRes.json();

    // If CAPTCHA fails, return an error
    if (!verifyData.success || verifyData.score < 0.5) {
      return res.status(401).json({ error: 'reCAPTCHA verification failed' });
    }

    // Check if the email exists
    const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const userId = rows[0].id;

    // Call the triggerPasswordReset function to generate token and send email
    const resetResult = await triggerPasswordReset(userId);

    if (resetResult.success) {
      return res.json({ message: 'Password reset initiated. Please check your email for further instructions.' });
    } else {
      return res.status(500).json({ error: resetResult.error || 'Failed to trigger password reset.' });
    }

  } catch (err) {
    console.error('[Password Reset Error]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
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
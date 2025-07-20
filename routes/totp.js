/**
 * @swagger
 * tags:
 *   name: 2FA
 *   description: Two‑factor authentication endpoints
 */
// routes/totp.js
const express   = require('express');
const { authenticate } = require('../middleware/auth');   // JWT middleware
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const pool      = require('../db');

const router = express.Router();

// Protect everything below
router.use(authenticate);

/**
 * POST /auth/2fa/verify
 * Body: { token }
 */
// POST /auth/2fa/verify
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const { rows } = await pool.query(
      'SELECT totp_secret FROM users WHERE id = $1',
      [req.user.id]
    );

    const secret = rows[0]?.totp_secret;
    if (!secret) return res.status(400).json({ error: 'No TOTP secret set for this user' });

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!verified) return res.status(401).json({ error: 'Invalid or expired token' });

    // ✅ Mark user as fully verified and 2FA enabled
    await pool.query(
      'UPDATE users SET totp_enabled = true, is_verified = true WHERE id = $1',
      [req.user.id]
    );

    res.json({ message: '2FA verification successful ✅' });
  } catch (err) {
    console.error('[2FA VERIFY ERROR]', err);
    res.status(500).json({ error: 'Unable to verify token due to server error' });
  }
});


module.exports = router;
//**
// * @swagger
// * tags:
// *   name: 2FA
// *   description: Two‑factor authentication endpoints
const fetch = require('node-fetch');
const express = require('express');
const { authenticate } = require('../middlewares/auth');  // JWT middleware
const pool = require('../db');

const router = express.Router();

// Protect everything below
router.use(authenticate);

/**
 * POST /auth/2fa/verify
 * Body: { captchaResponse }
 */
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { captchaResponse } = req.body; // reCAPTCHA response from frontend
    if (!captchaResponse) {
      return res.status(400).json({ error: 'Captcha response required' });
    }

    const secretKey = '6Lclc5MrAAAAADXpREb6CaedI5Ea5r5hK-336vE3'; // Your Secret Key for reCAPTCHA v3

    // Verify the CAPTCHA response with Google's reCAPTCHA API
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaResponse}`;

    // Send a POST request to Google reCAPTCHA API for validation
    const verifyRes = await fetch(verifyURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const verifyData = await verifyRes.json();

    // If CAPTCHA is invalid, return an error
    if (!verifyData.success || verifyData.score < 0.5) {  // You can adjust the score threshold (e.g., 0.5)
      return res.status(401).json({ error: 'CAPTCHA verification failed' });
    }

    // CAPTCHA is valid, mark user as verified in the database
    await pool.query(
      'UPDATE users SET is_verified = true WHERE id = $1',
      [req.user.id]
    );

    res.json({ message: 'CAPTCHA verification successful ✅' });

  } catch (err) {
    console.error('[2FA VERIFY ERROR]', err);
    res.status(500).json({ error: 'Unable to verify CAPTCHA due to server error' });
  }
});

module.exports = router;

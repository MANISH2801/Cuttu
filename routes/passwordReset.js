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
const router = express.Router();

// Function to trigger password reset
async function triggerPasswordReset(userId, email) {
  try {
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // Token expiration time

    // Save reset token and email to the database
    await pool.query(
      'INSERT INTO password_resets (user_id, email, token, expires_at) VALUES ($1, $2, $3, to_timestamp($4))',
      [userId, email, resetToken, expiresAt]
    );

    return { success: true };
  } catch (err) {
    console.error('[Password Reset Error]', err);
    return { success: false, error: 'Failed to trigger password reset.' };
  }
}

/**
 * POST /auth/request-password-reset
 * Body: { email, recaptchaToken }
 */
router.post('/request-password-reset', async (req, res) => {
  const { email, recaptchaToken } = req.body;

  if (!recaptchaToken) {
    return res.status(400).json({ error: 'reCAPTCHA token is required.' });
  }

  const secretKey = '6Lclc5MrAAAAADXpREb6CaedI5Ea5r5hK-336vE3';
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

    // Check if the email exists in the users table
    const { rows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const userId = rows[0].id;
    const resetResult = await triggerPasswordReset(userId, email);

    if (resetResult.success) {
      return res.json({ message: 'Password reset initiated. Please check your email for further instructions.' });
    } else {
      return res.status(500).json({ error: resetResult.error || 'Failed to initiate password reset.' });
    }
  } catch (err) {
    console.error('[Password Reset Error]', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});



// Assuming the route is in routes/tokenFetch.js

router.get('/fetch-token', async (req, res) => {
  const { email } = req.query; // Get the email from query parameters

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Fetch the token and expiration time from password_resets table using email
    const { rows } = await pool.query(
      'SELECT token, expires_at FROM password_resets WHERE email=$1 ORDER BY created_at DESC LIMIT 1', 
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No token found for this email' });
    }

    const { token, expires_at } = rows[0];

    // Check if token has expired
    if (new Date(expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token expired' });
    }

    // Return the token if everything is valid
    res.json({ token });
  } catch (err) {
    console.error('Error fetching token:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


/**
 * POST /auth/reset-password
 * Body: { token, password }
 */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  
  // Validate that both token and password are provided
  if (!token || !password) {
    return res.status(400).json({ error: 'Token & password required' });
  }

  try {
    // Check if the token exists and retrieve the user and expiration data
    const { rows } = await pool.query(
      'SELECT user_id, expires_at, status FROM password_resets WHERE token=$1',
      [token]
    );
    
    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const { user_id, expires_at, status } = rows[0];

    // Check if the token is expired
    if (new Date(expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token expired' });
    }

    // Check if the token has already been used
    if (status === 'used') {
      return res.status(400).json({ error: 'Token has already been used' });
    }

    // Hash the new password
    const hash = await bcrypt.hash(password, 10);

    // Update the user's password in the database
    await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hash, user_id]);

    // Mark the token as used and update the reset timestamp
    await pool.query(
      'UPDATE password_resets SET status=$1 WHERE token=$2',
      ['used', token]
    );

    // Optionally, delete the token from the table after use
    // await pool.query('DELETE FROM password_resets WHERE token=$1', [token]);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('[Password Reset Error]', err);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
});



module.exports = router;
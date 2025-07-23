const express = require("express"); 
const router = express.Router();
const pool = require("../db");

// ✅ Stripe is not needed — we're mocking
// const stripe = require('stripe')(process.env.STRIPE_SECRET || '');

// ✅ Mock Payment Endpoint
router.post("/create-intent", async (req, res) => {
  const { course_id } = req.body;

  // ✅ Check if user is attached (middleware should have set it)
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Unauthorized: User not found" });
  }

  const userId = req.user.id;

  try {
    // Insert mock order
    await pool.query(
      `INSERT INTO orders (
        user_id, course_id, amount,
        payment_status, payment_id,
        currency, payment_method, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, course_id, 0, "succeeded", "MOCK_PAYMENT_ID", "INR", "mock"]
    );

    // Enroll user
    await pool.query(
      `INSERT INTO enrollments (user_id, course_id, enrolled_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT DO NOTHING`,
      [userId, course_id]
    );

    res.json({ message: "✅ Mock payment succeeded and user enrolled" });
  } catch (err) {
    console.error("❌ Mock payment error:", err.message);
    res.status(500).json({ message: "Mock payment failed" });
  }
});

module.exports = router;

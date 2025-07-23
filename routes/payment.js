router.post('/create-intent', async (req, res) => {
  const { course_id } = req.body;
  const userId = req.user.id;

  try {
    // Simulate successful payment
    await pool.query(`
      INSERT INTO orders (
        user_id, course_id, amount,
        payment_status, payment_id,
        currency, payment_method, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [userId, course_id, 0, 'succeeded', 'MOCK_PAYMENT_ID', 'INR', 'mock']
    );

    await pool.query(`
      INSERT INTO enrollments (user_id, course_id, enrolled_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT DO NOTHING`,
      [userId, course_id]
    );

    res.json({ message: '✅ Mock payment succeeded and user enrolled' });
  } catch (err) {
    console.error('❌ Mock payment error:', err.message);
    res.status(500).json({ message: 'Mock payment failed' });
  }
});

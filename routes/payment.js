/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment and order handling
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');
const stripe = require('stripe')(process.env.STRIPE_SECRET || '');

const rawBodyParser = express.raw({ type: 'application/json' });

/**
 * POST /payments/create-intent
 * Creates a payment intent for Stripe
 */
router.post('/create-intent', async (req, res, next) => {
  try {
    const { amount, course_id, currency = 'inr' } = req.body;
    const userId = req.user.id;

    const intent = await stripe.paymentIntents.create({
      amount, // in paise
      currency,
      metadata: {
        course_id,
        user_id: userId
      },
      automatic_payment_methods: { enabled: true }
    });

    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /payments/webhook
 * Stripe webhook endpoint to confirm payment
 */
router.post('/webhook', rawBodyParser, async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;

    const courseId = intent.metadata.course_id;
    const userId = intent.metadata.user_id;

    const amount = intent.amount / 100; // convert to ₹
    const currency = intent.currency.toUpperCase();
    const paymentId = intent.id;
    const paymentMethod = intent.payment_method_types[0];
    const status = 'succeeded';

    try {
      // Insert order
      await pool.query(
        `INSERT INTO orders (
          user_id, course_id, amount,
          payment_status, payment_id,
          currency, payment_method, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [
          userId,
          courseId,
          amount,
          status,
          paymentId,
          currency,
          paymentMethod
        ]
      );

      // Enroll user
      await pool.query(
        `INSERT INTO enrollments (user_id, course_id, enrolled_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT DO NOTHING`,
        [userId, courseId]
      );

      console.log(`✅ Payment successful: user ${userId} for course ${courseId}`);
    } catch (err) {
      console.error('❌ DB Insert Error in webhook:', err.message);
    }
  }

  res.json({ received: true });
});

module.exports = router;

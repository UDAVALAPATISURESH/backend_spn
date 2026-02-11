const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');

// Webhook routes (no auth - they use signature verification)
// Note: Stripe webhook body is already parsed as raw in app.js
router.post('/webhook/stripe', paymentController.stripeWebhook);
router.post('/webhook/razorpay', express.json(), paymentController.razorpayWebhook);
router.post('/webhook/cashfree', express.json(), paymentController.cashfreeWebhook);

// Payment routes (require authentication)
router.use(auth);

// POST /api/payments/create-intent - Create payment intent/order
router.post('/create-intent', paymentController.createPaymentIntent);

// POST /api/payments/verify - Verify payment completion
router.post('/verify', paymentController.verifyPayment);

// POST /api/payments (legacy mock payment)
router.post('/', paymentController.createPayment);

module.exports = router;

